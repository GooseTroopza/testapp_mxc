/**
 * TasksPage — MXC Tasks App UI
 *
 * Copy this file to:  apps/shell/src/client/pages/TasksPage.tsx
 *
 * Then in apps/shell/src/client/App.tsx:
 *   import { TasksPage } from "./pages/TasksPage";
 *   <Route path="/tasks" element={<TasksPage />} />
 */

import React, { useState, useEffect, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTasks,
  useEmployees,
  useTaskStats,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskFilters,
  type CreateTaskInput,
} from "../hooks/useTasks";
import {
  PageHeader,
  Button,
  Input,
  Textarea,
  Card,
  CardContent,
  Badge,
  EmptyState,
  LoadingPage,
  Select,
  Modal,
} from "@mxc/ui";
import { useAuth } from "../hooks/useAuth";

// ─── Priority and status configs ─────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-slate-100 text-slate-700" },
  medium: { label: "Medium", color: "bg-amber-100 text-amber-700" },
  high: { label: "High", color: "bg-red-100 text-red-700" },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; next: TaskStatus | null }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700", next: "in-progress" },
  "in-progress": { label: "In Progress", color: "bg-purple-100 text-purple-700", next: "done" },
  done: { label: "Done", color: "bg-green-100 text-green-700", next: null },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function StatsBar() {
  const { data: stats } = useTaskStats();
  if (!stats) return null;

  const total = stats.byStatus.reduce((sum, s) => sum + s.count, 0);
  const done = stats.byStatus.find((s) => s.status === "done")?.count ?? 0;
  const inProgress = stats.byStatus.find((s) => s.status === "in-progress")?.count ?? 0;
  const open = stats.byStatus.find((s) => s.status === "open")?.count ?? 0;
  const high = stats.byPriority.find((p) => p.priority === "high")?.count ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Tasks</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{open}</div>
          <div className="text-xs text-muted-foreground mt-1">Open</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{inProgress}</div>
          <div className="text-xs text-muted-foreground mt-1">In Progress</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{done}</div>
          <div className="text-xs text-muted-foreground mt-1">Done</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Task form (create + edit) ────────────────────────────────────────────────

interface TaskFormProps {
  initial?: Partial<Task>;
  onSubmit: (data: CreateTaskInput) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

function TaskForm({ initial, onSubmit, onCancel, isLoading }: TaskFormProps) {
  const { data: employees = [] } = useEmployees();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "medium");
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? "open");
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? "");

  const selectedEmployee = employees.find((e) => e.id === assigneeId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      dueDate: dueDate || undefined,
      priority,
      status,
      assigneeId: assigneeId || undefined,
      assigneeName: selectedEmployee?.name,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title *</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Additional details..."
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Priority</label>
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
          >
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Due Date</label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Assignee</label>
          <Select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading || !title.trim()}>
          {isLoading ? "Saving..." : initial?.id ? "Update Task" : "Create Task"}
        </Button>
      </div>
    </form>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}

function TaskCard({ task, onEdit, onDelete, onStatusChange }: TaskCardProps) {
  const nextStatus = STATUS_CONFIG[task.status].next;
  const isOverdue =
    task.dueDate &&
    task.status !== "done" &&
    new Date(task.dueDate) < new Date(new Date().toDateString());

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-semibold ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                {task.title}
              </h3>
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
            </div>

            {task.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            )}

            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {task.assigneeName && (
                <span className="flex items-center gap-1">
                  <span>👤</span>
                  <span>{task.assigneeName}</span>
                </span>
              )}
              {task.dueDate && (
                <span className={`flex items-center gap-1 ${isOverdue ? "text-red-500 font-medium" : ""}`}>
                  <span>📅</span>
                  <span>{isOverdue ? "Overdue: " : ""}{task.dueDate}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {nextStatus && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStatusChange(task.id, nextStatus)}
                title={`Move to ${STATUS_CONFIG[nextStatus].label}`}
              >
                →
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(task)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(task.id)}
            >
              ✕
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TasksPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<TaskFilters>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [liveIndicator, setLiveIndicator] = useState(false);

  const { tasks, isLoading, createTask, updateTask, deleteTask, isCreating, isUpdating } =
    useTasks(filters);

  const { data: employees = [] } = useEmployees();

  // Connect to SSE for real-time updates
  // Show a brief "live" indicator when updates arrive
  const queryClient = useQueryClient();
  useEffect(() => {
    const es = new EventSource("/api/tasks/events", { withCredentials: true });
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (["task:created", "task:updated", "task:deleted"].includes(data.type)) {
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          queryClient.invalidateQueries({ queryKey: ["tasks-stats"] });
          setLiveIndicator(true);
          setTimeout(() => setLiveIndicator(false), 2000);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [queryClient]);

  const handleCreate = async (data: CreateTaskInput) => {
    await createTask(data);
    setShowCreateModal(false);
  };

  const handleUpdate = async (data: CreateTaskInput) => {
    if (!editingTask) return;
    await updateTask({ id: editingTask.id, ...data });
    setEditingTask(null);
  };

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    await updateTask({ id, status });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    await deleteTask(id);
  };

  if (isLoading) return <LoadingPage message="Loading tasks..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Tasks"
        description="Manage and track tasks across your team"
        actions={
          <div className="flex items-center gap-2">
            {liveIndicator && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="animate-pulse">●</span> Live
              </span>
            )}
            <Button onClick={() => setShowCreateModal(true)}>+ New Task</Button>
          </div>
        }
      />

      {/* Stats */}
      <StatsBar />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm font-medium text-muted-foreground">Filter:</span>

            <Select
              value={filters.status ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as TaskStatus || undefined }))}
              className="w-36"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </Select>

            <Select
              value={filters.priority ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as TaskPriority || undefined }))}
              className="w-36"
            >
              <option value="">All Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>

            <Select
              value={filters.assigneeId ?? (filters.assigneeMe ? "__me__" : "")}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__me__") {
                  setFilters((f) => ({ ...f, assigneeId: undefined, assigneeMe: true }));
                } else {
                  setFilters((f) => ({ ...f, assigneeId: val || undefined, assigneeMe: false }));
                }
              }}
              className="w-44"
            >
              <option value="">All Assignees</option>
              <option value="__me__">Assigned to me</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </Select>

            {(filters.status || filters.priority || filters.assigneeId || filters.assigneeMe) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({})}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Task list */}
      {tasks.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No tasks found"
          description={
            Object.keys(filters).length > 0
              ? "No tasks match the current filters."
              : "Create your first task to get started."
          }
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={setEditingTask}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <Modal
          title="New Task"
          onClose={() => setShowCreateModal(false)}
        >
          <TaskForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreateModal(false)}
            isLoading={isCreating}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editingTask && (
        <Modal
          title="Edit Task"
          onClose={() => setEditingTask(null)}
        >
          <TaskForm
            initial={editingTask}
            onSubmit={handleUpdate}
            onCancel={() => setEditingTask(null)}
            isLoading={isUpdating}
          />
        </Modal>
      )}
    </div>
  );
}

