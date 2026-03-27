/**
 * useTasks — React Query hook for the Tasks app
 *
 * Copy this file to:  apps/shell/src/client/hooks/useTasks.ts
 */

import { useQuery, useMutation, useQueryClient, useEffect } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "in-progress" | "done";

export interface Task {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  name: string;
  title: string | null;
  branch: string | null;
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  assigneeMe?: boolean;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigneeId?: string;
  assigneeName?: string;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  id: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

async function fetchTasks(filters: TaskFilters = {}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.assigneeMe) params.set("assigneeMe", "true");

  const url = `/api/tasks${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch tasks");
  const json = await res.json();
  return json.ok ? json.data : [];
}

async function fetchTask(id: string): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch task");
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Not found");
  return json.data;
}

async function createTask(data: CreateTaskInput): Promise<Task> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Failed to create task");
  return json.data;
}

async function updateTask({ id, ...data }: UpdateTaskInput): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Failed to update task");
  return json.data;
}

async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Failed to delete task");
}

async function fetchEmployees(): Promise<Employee[]> {
  const res = await fetch("/api/tasks/employees/list", { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.ok ? json.data : [];
}

async function fetchStats(): Promise<{ byStatus: Array<{ status: string; count: number }>; byPriority: Array<{ priority: string; count: number }> }> {
  const res = await fetch("/api/tasks/stats", { credentials: "include" });
  if (!res.ok) return { byStatus: [], byPriority: [] };
  const json = await res.json();
  return json.ok ? json.data : { byStatus: [], byPriority: [] };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Main hook for task list with filters and mutations.
 */
export function useTasks(filters: TaskFilters = {}) {
  const queryClient = useQueryClient();
  const filterKey = JSON.stringify(filters);

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["tasks", filterKey],
    queryFn: () => fetchTasks(filters),
  });

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const updateMutation = useMutation({
    mutationFn: updateTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return {
    tasks,
    isLoading,
    error,
    createTask: createMutation.mutateAsync,
    updateTask: updateMutation.mutateAsync,
    deleteTask: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Hook to subscribe to real-time SSE updates for tasks.
 * Automatically invalidates the task query cache when changes are received.
 */
export function useTasksSSE() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/tasks/events", { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (["task:created", "task:updated", "task:deleted"].includes(data.type)) {
          // Invalidate all task queries — triggers refetch
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      // Browser will auto-reconnect EventSource
    };

    return () => {
      es.close();
    };
  }, [queryClient]);
}

/**
 * Hook for loading employees (for assignee picker).
 */
export function useEmployees() {
  return useQuery({
    queryKey: ["tasks-employees"],
    queryFn: fetchEmployees,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook for task stats (count by status / priority).
 */
export function useTaskStats() {
  return useQuery({
    queryKey: ["tasks-stats"],
    queryFn: fetchStats,
    refetchInterval: 30_000, // Refresh every 30 seconds
  });
}
