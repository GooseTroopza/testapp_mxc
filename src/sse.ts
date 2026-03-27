/**
 * SSE (Server-Sent Events) manager for the Tasks app.
 *
 * This module maintains a registry of active SSE connections and provides
 * a function to broadcast task change events to all connected clients.
 *
 * Usage:
 *   - GET /api/tasks/events — clients connect here to receive real-time updates
 *   - When a task is created/updated/deleted, call broadcastTaskEvent()
 */

export type TaskEventType = "task:created" | "task:updated" | "task:deleted";

export interface TaskEvent {
  type: TaskEventType;
  tenantId: string;
  taskId: string;
  data?: Record<string, unknown>;
}

// Map of tenantId → Set of SSE response writers
// Each writer is a function that sends a chunk to the SSE response stream
type SseWriter = (data: string) => void;
const sseClients = new Map<string, Set<SseWriter>>();

/**
 * Register a new SSE client for a given tenant.
 * Returns a cleanup function to unregister the client.
 */
export function registerSseClient(tenantId: string, writer: SseWriter): () => void {
  if (!sseClients.has(tenantId)) {
    sseClients.set(tenantId, new Set());
  }
  sseClients.get(tenantId)!.add(writer);

  return () => {
    sseClients.get(tenantId)?.delete(writer);
    if (sseClients.get(tenantId)?.size === 0) {
      sseClients.delete(tenantId);
    }
  };
}

/**
 * Broadcast a task event to all SSE clients connected for the given tenant.
 */
export function broadcastTaskEvent(event: TaskEvent): void {
  const clients = sseClients.get(event.tenantId);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({
    type: event.type,
    taskId: event.taskId,
    data: event.data ?? {},
    timestamp: Date.now(),
  });

  const sseMessage = `data: ${payload}\n\n`;

  for (const writer of clients) {
    try {
      writer(sseMessage);
    } catch {
      // Client disconnected — will be cleaned up on its close handler
    }
  }
}

/**
 * Get the count of active SSE connections across all tenants (for diagnostics).
 */
export function getSseConnectionCount(): number {
  let total = 0;
  for (const set of sseClients.values()) {
    total += set.size;
  }
  return total;
}
