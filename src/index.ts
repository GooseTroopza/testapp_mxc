import { defineApp } from "@mxc/sdk";
import { createTasksRoutes } from "./routes.js";

/**
 * MXC Tasks App
 *
 * A task management app that exercises every major MXC platform feature:
 *   - SDK entity reads (employees from data platform)
 *   - SDK mutations (AppDb CRUD, Drizzle ORM)
 *   - Auth context (session.userId as default creator, permission gating)
 *   - Real-time SSE (task changes broadcast to all connected clients)
 *   - Workbench manifest (id, name, icon, routes, permissions, events, settings)
 *   - Hot-load (app.reload() via Admin → Apps → Reload)
 *
 * Table: app_tasks_tasks (auto-namespaced by AppDb)
 */
export default defineApp(
  {
    id: "tasks",
    name: "Tasks",
    version: "1.0.0",
    description: "Task management with real-time updates, employee assignment, and priority tracking",
    tier: "free",
    icon: "CheckSquare",

    permissions: [
      "tasks:read",
      "tasks:write",
      "tasks:delete",
    ],

    events: {
      emits: [
        "tasks:task-created",
        "tasks:task-updated",
        "tasks:task-deleted",
      ],
    },

    routes: {
      api: "/api/tasks",
      pages: "/tasks",
    },

    // Optional settings configurable per-tenant in Admin → Apps → Tasks → Settings
    settings: [
      {
        key: "defaultPriority",
        label: "Default Task Priority",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
        default: "medium",
      },
      {
        key: "autoAssignToCreator",
        label: "Auto-assign tasks to creator",
        type: "boolean",
        default: false,
        description: "Automatically assign new tasks to the user who creates them",
      },
    ],
  },
  async (ctx) => {
    // ── Database setup (idempotent — runs on every startup) ────────────────
    //
    // AppDb automatically prefixes the table: app_tasks_tasks
    // Standard columns added automatically: id, tenant_id, created_at, updated_at
    //
    ctx.appDb.createTable("tasks", `
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date    TEXT,
      priority    TEXT NOT NULL DEFAULT 'medium',
      status      TEXT NOT NULL DEFAULT 'open',
      assignee_id TEXT,
      assignee_name TEXT,
      created_by  TEXT NOT NULL
    `);

    ctx.logger.log("[tasks] Schema ready (table: app_tasks_tasks)");

    // ── Build routes ───────────────────────────────────────────────────────
    const api = createTasksRoutes(ctx);

    // ── Event handler: listen for data sync events ─────────────────────────
    // When employees are synced, we could refresh cached assignee names.
    // This demonstrates the event subscription pattern.
    const eventHandlers = {
      "sync.completed": async (event: unknown) => {
        const e = event as { payload?: { flowName?: string } };
        if (e.payload?.flowName?.toLowerCase().includes("employee")) {
          ctx.logger.log("[tasks] Employees synced — assignee names may need refresh");
        }
      },
    };

    // ── Return app setup result ────────────────────────────────────────────
    return {
      api,
      eventHandlers,
      teardown: async () => {
        ctx.logger.log("[tasks] App teardown — SSE connections will close");
      },
    };
  },
);
