import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Tasks table — namespaced as app_tasks_tasks per MXC conventions.
 *
 * Fields:
 *   id          — UUID primary key
 *   tenant_id   — Multi-tenancy: always scope queries by this
 *   title       — Task title (required)
 *   description — Task description (optional)
 *   due_date    — ISO date string e.g. "2025-12-31" (optional)
 *   priority    — "low" | "medium" | "high"
 *   status      — "open" | "in-progress" | "done"
 *   assignee_id — Employee ID from the MXC employees entity (optional)
 *   assignee_name — Cached display name for the assignee
 *   created_by  — User ID of creator
 *   created_at  — Unix timestamp
 *   updated_at  — Unix timestamp
 */
export const tasks = sqliteTable("app_tasks_tasks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  assigneeId: text("assignee_id"),
  assigneeName: text("assignee_name"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
