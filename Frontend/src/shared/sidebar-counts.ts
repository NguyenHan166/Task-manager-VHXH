import { useSyncExternalStore } from "react";

export type SidebarCountKey = "tasks" | "approvals" | "projects" | "recurrence" | "members";
export type SidebarCounts = Partial<Record<SidebarCountKey, number>>;

const EMPTY_COUNTS: SidebarCounts = Object.freeze({});
const STORAGE_PREFIX = "office_workspace_sidebar_counts_v1:";
const countsByUser = new Map<string, SidebarCounts>();
const listeners = new Set<() => void>();

function getCounts(userId?: string): SidebarCounts {
  if (!userId) return EMPTY_COUNTS;
  const existing = countsByUser.get(userId);
  if (existing) return existing;

  try {
    const saved = sessionStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (saved) {
      const parsed = JSON.parse(saved) as SidebarCounts;
      countsByUser.set(userId, parsed);
      return parsed;
    }
  } catch {
    // Counts are a convenience; ignore storage being unavailable or malformed.
  }

  countsByUser.set(userId, EMPTY_COUNTS);
  return EMPTY_COUNTS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidebarCounts(userId?: string): SidebarCounts {
  return useSyncExternalStore(subscribe, () => getCounts(userId), () => EMPTY_COUNTS);
}

export function setSidebarCounts(userId: string | undefined, updates: SidebarCounts): void {
  if (!userId) return;
  const current = getCounts(userId);
  const next = { ...current, ...updates };
  if (Object.keys(updates).every((key) => current[key as SidebarCountKey] === next[key as SidebarCountKey])) return;

  countsByUser.set(userId, next);
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(next));
  } catch {
    // Keep the in-memory value even when storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

export function setSidebarCount(userId: string | undefined, key: SidebarCountKey, count: number): void {
  setSidebarCounts(userId, { [key]: Math.max(0, Math.floor(count)) });
}
