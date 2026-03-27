# MXC Tasks App

A production-ready task management app for the [MXC platform](https://github.com/GooseTroopza/MXC). Exercises every major MXC platform feature: entity reads, SDK mutations, auth context, real-time SSE, workbench manifest, and hot-load.

---

## What It Does

- **Create, edit, complete, delete tasks** with title, description, due date, priority, and status
- **Priority levels:** Low / Medium / High (colour-coded badges)
- **Status tracking:** Open → In Progress → Done (one-click progression)
- **Employee assignment:** Link tasks to any employee from the MXC data platform
- **Employee view:** Filter tasks by assignee — each employee has their own task list
- **Real-time updates:** SSE stream broadcasts task changes live to all open browser tabs
- **Stats dashboard:** Count widgets by status and priority
- **Filters:** By status, priority, assignee, or "assigned to me"
- **Overdue highlighting:** Past-due open tasks are flagged red

---

## MXC Platform Features Exercised

| Feature | How it's used |
|---------|---------------|
| **SDK `defineApp()`** | App manifest, setup function, teardown |
| **AppDb (scoped DB)** | `ctx.appDb.createTable()`, `ctx.appDb.query()`, `tableName()` |
| **Drizzle ORM** | Schema (`schema.ts`), typed CRUD, multi-condition `where` clauses |
| **Auth context** | `session.userId` as task creator, `requireAuth()` on all routes |
| **Permissions** | `tasks:read`, `tasks:write`, `tasks:delete` auto-granted to admin |
| **Event bus** | Emits `tasks:task-created`, `tasks:task-updated`, `tasks:task-deleted` |
| **Event subscription** | Subscribes to `sync.completed` to detect employee sync |
| **Real-time SSE** | `/api/tasks/events` — streams changes to all connected clients |
| **Data platform** | Reads `data_default_employees` for assignee picker |
| **App settings** | `defaultPriority`, `autoAssignToCreator` configurable in Admin → Apps |
| **App manifest** | `id`, `name`, `icon`, `routes`, `permissions`, `events`, `tier`, `settings` |
| **Hot-load** | `teardown()` hook; app reloads via Admin → Apps → Reload |
| **Multi-tenancy** | All queries scoped by `session.tenantId` |

---

## Prerequisites

1. **MXC platform running** — either locally or on staging
   - Staging: https://mxc.mechtric.com.au
   - Self-hosted: follow the MXC monorepo setup
2. **Node.js 22+** and **pnpm**
3. **MXC API key** with admin permissions (create in Admin → API Keys)
4. **Git** for cloning

---

## Installation

### Step 1 — Clone into the MXC monorepo

The Tasks app runs inside the MXC monorepo. Clone the MXC repo and place the app in `apps/tasks/`:

```bash
# Clone MXC (if you haven't already)
git clone git@github.com:GooseTroopza/MXC.git
cd MXC
git checkout claude/mxc-platform-rebuild-iqC7C

# Copy the Tasks app into the apps directory
cp -r /path/to/testapp_mxc apps/tasks
```

### Step 2 — Add frontend files to the shell

The React frontend lives in `apps/shell/src/client/`. Copy the integration files:

```bash
# Copy the hook
cp apps/tasks/shell-integration/hooks/useTasks.ts \
   apps/shell/src/client/hooks/useTasks.ts

# Copy the page component
cp apps/tasks/shell-integration/pages/TasksPage.tsx \
   apps/shell/src/client/pages/TasksPage.tsx
```

### Step 3 — Register in the shell

**`apps/shell/src/client/App.tsx`** — add the route:

```tsx
import { TasksPage } from "./pages/TasksPage";

// Inside <Routes>:
<Route path="/tasks" element={<TasksPage />} />
```

**`apps/shell/package.json`** — add the dependency:

```json
{
  "dependencies": {
    "@mxc/app-tasks": "workspace:*"
  }
}
```

**`apps/shell/src/server/index.ts`** — add to `knownApps`:

```typescript
const knownApps = ["@mxc/app-notes", "@mxc/app-pivot", "@mxc/app-tasks"];
```

### Step 4 — Install and build

```bash
# From the monorepo root
pnpm install
pnpm --filter @mxc/app-tasks build
pnpm build
```

### Step 5 — Install the app into MXC

Either via the Admin UI (**Admin → Apps → Install App**, enter `local:./apps/tasks`) or via the API:

```bash
curl -X POST https://mxc.mechtric.com.au/api/apps/install \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source": "local:./apps/tasks"}'
```

The Tasks app will appear in the sidebar as **Tasks** (✅ icon) immediately.

---

## API Reference

All routes are under `/api/tasks` and require authentication.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List tasks (supports `?status`, `?priority`, `?assigneeId`, `?assigneeMe=true`) |
| `GET` | `/api/tasks/:id` | Get single task |
| `POST` | `/api/tasks` | Create task |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `GET` | `/api/tasks/events` | SSE stream — real-time task changes |
| `GET` | `/api/tasks/employees/list` | List employees for assignee picker |
| `GET` | `/api/tasks/stats` | Task counts by status and priority |
| `GET` | `/api/tasks/health` | Health check + SSE connection count |

### Task object

```json
{
  "id": "uuid",
  "tenantId": "default",
  "title": "Deploy to production",
  "description": "Run migrations first",
  "dueDate": "2025-12-31",
  "priority": "high",
  "status": "in-progress",
  "assigneeId": "123",
  "assigneeName": "Jane Smith",
  "createdBy": "user-uuid",
  "createdAt": 1700000000,
  "updatedAt": 1700000000
}
```

### Create task

```bash
curl -X POST https://mxc.mechtric.com.au/api/tasks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Review quarterly report",
    "description": "Check the numbers before the meeting",
    "dueDate": "2025-06-30",
    "priority": "high",
    "status": "open",
    "assigneeId": "123",
    "assigneeName": "Jane Smith"
  }'
```

### Real-time SSE

```javascript
const es = new EventSource("/api/tasks/events", { withCredentials: true });
es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: "task:created" | "task:updated" | "task:deleted" | "connected"
  // data.taskId: string
  // data.data: full task object (for created/updated)
  // data.timestamp: unix ms
};
```

---

## Configuration

Settings are configurable per-tenant in **Admin → Apps → Tasks → Settings**:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `defaultPriority` | select | `medium` | Default priority for new tasks |
| `autoAssignToCreator` | boolean | `false` | Auto-assign new tasks to the creator |

---

## Local Development

```bash
# Start the MXC dev server (from monorepo root)
pnpm dev

# Typecheck just the tasks app
pnpm --filter @mxc/app-tasks typecheck

# Rebuild after changes
pnpm --filter @mxc/app-tasks build

# Reload in the running server (without restart)
curl -X POST http://localhost:3000/api/apps/tasks/reload \
  -H "Authorization: Bearer YOUR_API_KEY"
```

The dev server starts at `http://localhost:3000`. The Tasks app is accessible at `/tasks`.

---

## File Structure

```
apps/tasks/                          ← App package (installed into MXC monorepo)
├── package.json                     ← @mxc/app-tasks, declares workspace deps
├── tsconfig.json                    ← Extends @mxc/tsconfig/node.json
├── README.md                        ← This file
└── src/
    ├── index.ts                     ← defineApp() manifest + setup function
    ├── routes.ts                    ← Hono API routes (CRUD + SSE + employees + stats)
    ├── schema.ts                    ← Drizzle ORM table definition (app_tasks_tasks)
    └── sse.ts                       ← SSE connection registry + broadcast helpers

shell-integration/                   ← Files to copy into apps/shell/src/client/
├── hooks/
│   └── useTasks.ts                  ← React Query hooks (useTasks, useTasksSSE, useEmployees)
└── pages/
    └── TasksPage.tsx                ← Full React page component
```

---

## Database Schema

Table name: `app_tasks_tasks` (auto-namespaced by AppDb)

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `tenant_id` | TEXT | Multi-tenant scope |
| `title` | TEXT | Task title (required) |
| `description` | TEXT | Optional description |
| `due_date` | TEXT | ISO date string (YYYY-MM-DD) |
| `priority` | TEXT | `low` / `medium` / `high` |
| `status` | TEXT | `open` / `in-progress` / `done` |
| `assignee_id` | TEXT | Employee ID from data platform |
| `assignee_name` | TEXT | Cached display name |
| `created_by` | TEXT | User ID of creator |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |

---

## Platform Events

The Tasks app emits the following events to the MXC event bus. Any workflow can subscribe to these:

| Event type | When fired | Payload |
|------------|-----------|---------|
| `tasks:task-created` | New task created | `{ taskId, title, createdBy }` |
| `tasks:task-updated` | Task modified | `{ taskId, changes: string[] }` |
| `tasks:task-deleted` | Task deleted | `{ taskId }` |

---

## Known Limitations

1. **SSE is in-process only** — if MXC runs across multiple Node processes or servers, SSE connections on one instance won't receive broadcasts from another. For multi-process deployments, use a shared pub/sub (Redis, etc.) to fan out the broadcasts. The current implementation is correct for single-process deployments.

2. **Employee assignee names are cached** — `assignee_name` is stored at task-creation time. If an employee's name changes in NetSuite and re-syncs, existing task assignee names won't auto-update. This is intentional (denormalization for read performance). The app listens for `sync.completed` events and logs a warning when employees sync.

3. **Employee data requires a sync** — the employee list is read from `data_default_employees`. If no employee sync has run, the assignee picker will be empty (the app gracefully returns an empty list with a warning).

4. **Frontend requires shell integration** — the React UI lives in `apps/shell/src/client/`. This is the MXC architecture: all frontend code is in the shell app. The `shell-integration/` directory contains the files to copy.

5. **No server-side pagination on task list** — all tasks for a tenant are returned in a single query. For production use with large datasets, add `LIMIT`/`OFFSET` and pass `page`/`limit` params.

6. **SSE auth via cookie only** — `EventSource` uses credentials (cookies) for auth. API key auth is not supported on the SSE endpoint. This matches MXC's session-based auth model.

---

## Troubleshooting

**Tasks app shows as `error` in Admin → Apps**
- Check `ctx.appDb.createTable()` succeeded — run `pnpm --filter @mxc/app-tasks build` and reload
- Check server logs for the specific error message

**Employee list is empty**
- Run an employee sync from Admin → Data → Sync
- Or check that `data_default_employees` table exists: `GET /api/data/records/employees`

**SSE not receiving updates**
- Check browser console for EventSource errors
- Confirm `/api/tasks/events` returns `Content-Type: text/event-stream`
- Nginx/proxy must not buffer SSE — the app sets `X-Accel-Buffering: no` header

**`Cannot find module '@mxc/sdk'`**
- Run `pnpm install` from monorepo root
- Rebuild SDK: `pnpm --filter @mxc/sdk build`

---

## Contributing

This app is part of the MXC ecosystem. Pull requests welcome. See [MXC SDK README](../../packages/sdk/README.md) for development conventions.
