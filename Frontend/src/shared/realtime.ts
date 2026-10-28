import { io, type Socket } from "socket.io-client";
import { apiClient, type AuthSession } from "./api-client";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = (configuredBaseUrl || "http://localhost:3000/api").replace(/\/$/, "");
const socketOrigin = new URL(apiBaseUrl).origin;

let socket: Socket | null = null;
let connectedToken: string | null = null;
const taskRoomCounts = new Map<string, number>();

export function syncRealtimeSession(
  session: AuthSession | null,
  onDataChanged: () => void,
): void {
  const token = session?.accessToken ?? null;
  if (!token) {
    disconnectRealtime();
    return;
  }
  if (socket && connectedToken === token) return;

  disconnectRealtime();
  connectedToken = token;
  socket = io(`${socketOrigin}/realtime`, {
    auth: { token },
    withCredentials: true,
    reconnection: true,
    transports: ["websocket", "polling"],
  });
  socket.on("connect", () => {
    taskRoomCounts.forEach((_count, taskId) => socket?.emit("room:join", { taskId }));
    onDataChanged();
  });
  socket.on("notification:new", onDataChanged);
  socket.on("task:updated", onDataChanged);
  socket.on("connect_error", (error) => {
    if (error.message.toLowerCase().includes("unauthorized")) {
      void apiClient.refresh().catch(() => undefined);
    }
  });
}

export function disconnectRealtime(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  connectedToken = null;
}

export function joinTaskRoom(taskId: string): () => void {
  taskRoomCounts.set(taskId, (taskRoomCounts.get(taskId) ?? 0) + 1);
  socket?.emit("room:join", { taskId });
  return () => {
    const nextCount = (taskRoomCounts.get(taskId) ?? 1) - 1;
    if (nextCount > 0) {
      taskRoomCounts.set(taskId, nextCount);
      return;
    }
    taskRoomCounts.delete(taskId);
    socket?.emit("room:leave", { taskId });
  };
}
