import { Hono } from "hono";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "@mxc/auth";
import type { AppContext } from "@mxc/sdk";
import { tasks } from "./schema.js";
import { broadcastTaskEvent, registerSseClient, getSseConnectionCount } from "./sse.js";

interface TaskBody {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  assigneeId?: string;
  assigneeName?: string;
}

export function createTasksRoutes(ctx: AppContext) {
  const { db, events } = ctx;
  const app = new Hono();

  // ─── SSE endpoint — real-time task updates ────────────────────────────────
  //
  // GET /api/tasks/events
  // Clients connect here and receive a stream of task change events.
  // Event format: data: {"type":"task:created","taskId":"...","data":{...},"timestamp":...}
  //
  app.get("/events", requireAuth(), (c) => {
    const session = c.get("session");

    // Set SSE headers
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    let cleanup: (() => void) | null = null;
    let controller: ReadableStreamDefaultController | null = null;

    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;

        // Send initial connected message
        const connectMsg = `data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`;
        ctrl.enqueue(new TextEncoder().encode(connectMsg));

        // Register this client to receive broadcasts
        cleanup = registerSseClient(session.tenantId, (data: string) => {
          try {
            ctrl.enqueue(new TextEncoder().encode(data));
          } catch {
            // Stream closed
          }
        });

        ctx.logger.log(`[tasks] SSE client connected (tenant=${session.tenantId}, total=${getSseConnectionCount()})`);
      },
      cancel() {
        // Client disconnected
        cleanup?.();
        ctx.logger.log(`[tasks] SSE client disconnected (tenant=${session.tenantId})`);
      },
    });

    return new Response(stream, { headers });
  });

  // ─── Health check ─────────────────────────────────────────────────────────
  app.get("/health", (c) => {
    return c.json({ ok: true, connections: getSseConnectionCount() });
  });

  // ─── List tasks ───────────────────────────────────────────────────────────
  //
  // GET /api/tasks
  // Query params:
  //   ?status=open|in-progress|done
  //   ?priority=low|medium|high
  //   ?assigneeId=<employee_id>
  //   ?assigneeMe=true  — tasks assigned to the current user
  //
  app.get("/", requireAuth(), (c) => {
    const session = c.get("session");
    const statusFilter = c.req.query("status");
    const priorityFilter = c.req.query("priority");
    const assigneeIdFilter = c.req.query("assigneeId");
    const assigneeMe = c.req.query("assigneeMe") === "true";

    // Apply filters
    const conditions = [eq(tasks.tenantId, session.tenantId)];

    if (statusFilter) {
      conditions.push(eq(tasks.status, statusFilter));
    }
    if (priorityFilter) {
      conditions.push(eq(tasks.priority, priorityFilter));
    }
    if (assigneeMe) {
      conditions.push(eq(tasks.assigneeId, session.userId));
    } else if (assigneeIdFilter) {
      conditions.push(eq(tasks.assigneeId, assigneeIdFilter));
    }

    const result = db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(asc(tasks.status), desc(tasks.updatedAt))
      .all();

    return c.json({ ok: true, data: result, total: result.length });
  });

  // ─── Get single task ──────────────────────────────────────────────────────
  app.get("/:id", requireAuth(), (c) => {
    const session = c.get("session");
    const id = c.req.param("id");

    const task = db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, session.tenantId)))
      .get();

    if (!task) {
      return c.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } },
        404,
      );
    }

    return c.json({ ok: true, data: task });
  });

  // ─── Create task ──────────────────────────────────────────────────────────
  app.post("/", requireAuth(), async (c) => {
    const session = c.get("session");
    const body = await c.req.json<TaskBody>();

    if (!body.title?.trim()) {
      return c.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "Title is required" } },
        400,
      );
    }

    const priority = body.priority ?? "medium";
    if (!["low", "medium", "high"].includes(priority)) {
      return c.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "Invalid priority (low|medium|high)" } },
        400,
      );
    }

    const status = body.status ?? "open";
    if (!["open", "in-progress", "done"].includes(status)) {
      return c.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "Invalid status (open|in-progress|done)" } },
        400,
      );
    }

    const id = crypto.randomUUID();
    db.insert(tasks)
      .values({
        id,
        tenantId: session.tenantId,
        title: body.title.trim(),
        description: body.description?.trim() ?? "",
        dueDate: body.dueDate ?? null,
        priority,
        status,
        assigneeId: body.assigneeId ?? null,
        assigneeName: body.assigneeName?.trim() ?? null,
        createdBy: session.userId,
      })
      .run();

    const created = db.select().from(tasks).where(eq(tasks.id, id)).get();

    // Emit platform event
    await events.emit({
      type: "tasks:task-created",
      source: "tasks",
      tenantId: session.tenantId,
      payload: { taskId: id, title: body.title, createdBy: session.userId },
    });

    // Broadcast SSE to all connected clients in this tenant
    broadcastTaskEvent({
      type: "task:created",
      tenantId: session.tenantId,
      taskId: id,
      data: created as Record<string, unknown>,
    });

    ctx.logger.log(`[tasks] Created task ${id} by ${session.userId}`);
    return c.json({ ok: true, data: created }, 201);
  });

  // ─── Update task ──────────────────────────────────────────────────────────
  app.put("/:id", requireAuth(), async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");
    const body = await c.req.json<TaskBody>();

    const existing = db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, session.tenantId)))
      .get();

    if (!existing) {
      return c.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } },
        404,
      );
    }

    if (body.priority && !["low", "medium", "high"].includes(body.priority)) {
      return c.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "Invalid priority" } },
        400,
      );
    }

    if (body.status && !["open", "in-progress", "done"].includes(body.status)) {
      return c.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "Invalid status" } },
        400,
      );
    }

    const updates: Partial<typeof tasks.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate || null;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;
    if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId || null;
    if (body.assigneeName !== undefined) updates.assigneeName = body.assigneeName?.trim() || null;

    db.update(tasks).set(updates).where(eq(tasks.id, id)).run();

    const updated = db.select().from(tasks).where(eq(tasks.id, id)).get();

    // Emit platform event
    await events.emit({
      type: "tasks:task-updated",
      source: "tasks",
      tenantId: session.tenantId,
      payload: { taskId: id, changes: Object.keys(updates) },
    });

    // Broadcast SSE
    broadcastTaskEvent({
      type: "task:updated",
      tenantId: session.tenantId,
      taskId: id,
      data: updated as Record<string, unknown>,
    });

    return c.json({ ok: true, data: updated });
  });

  // ─── Delete task ──────────────────────────────────────────────────────────
  app.delete("/:id", requireAuth(), async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");

    const existing = db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, session.tenantId)))
      .get();

    if (!existing) {
      return c.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } },
        404,
      );
    }

    db.delete(tasks).where(eq(tasks.id, id)).run();

    // Emit platform event
    await events.emit({
      type: "tasks:task-deleted",
      source: "tasks",
      tenantId: session.tenantId,
      payload: { taskId: id },
    });

    // Broadcast SSE
    broadcastTaskEvent({
      type: "task:deleted",
      tenantId: session.tenantId,
      taskId: id,
    });

    ctx.logger.log(`[tasks] Deleted task ${id} by ${session.userId}`);
    return c.json({ ok: true });
  });

  // ─── Employee list ────────────────────────────────────────────────────────
  //
  // GET /api/tasks/employees
  // Returns employees from the MXC data platform (for assignee selection).
  // Falls back to empty array if employees entity is not available.
  //
  app.get("/employees/list", requireAuth(), (c) => {
    const session = c.get("session");

    try {
      // Query the MXC employees entity table directly
      // Table name: data_default_employees (default tenant)
      const tenantSlug = "default";
      const tableName = `data_${tenantSlug}_employees`;

      // Use ctx.appDb for raw SQL since this is cross-entity access
      const employees = ctx.appDb.query<{
        employee_id: string;
        first_name: string;
        last_name: string;
        job_title: string | null;
        branch: string | null;
      }>(
        `SELECT employee_id, first_name, last_name, job_title, branch
         FROM "${tableName}"
         ORDER BY last_name, first_name
         LIMIT 200`,
      );

      return c.json({
        ok: true,
        data: employees.map((e) => ({
          id: e.employee_id,
          name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
          title: e.job_title ?? null,
          branch: e.branch ?? null,
        })),
      });
    } catch (err) {
      // Entity table may not exist yet (data not synced)
      ctx.logger.warn(`[tasks] Could not query employees entity: ${err}`);
      return c.json({ ok: true, data: [], warning: "Employee data not available" });
    }
  });

  // ─── Task stats (by status and priority) ─────────────────────────────────
  //
  // GET /api/tasks/stats
  // Returns counts grouped by status and priority for dashboard widgets.
  //
  app.get("/stats", requireAuth(), (c) => {
    const session = c.get("session");

    const byStatus = ctx.appDb.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count
       FROM "${ctx.appDb.tableName("tasks")}"
       WHERE tenant_id = ?
       GROUP BY status`,
      session.tenantId,
    );

    const byPriority = ctx.appDb.query<{ priority: string; count: number }>(
      `SELECT priority, COUNT(*) as count
       FROM "${ctx.appDb.tableName("tasks")}"
       WHERE tenant_id = ?
       GROUP BY priority`,
      session.tenantId,
    );

    return c.json({
      ok: true,
      data: { byStatus, byPriority },
    });
  });

  return app;
}
