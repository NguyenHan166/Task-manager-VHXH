import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import type { AppError, User } from "../../shared/data-contract";
import { ApiError, apiClient, isMockMode } from "../../shared/api-client";
import { httpRepository } from "../../shared/repository";
import { mockRepository } from "../../mocks/mock-repository";
import { DomainError } from "../../shared/errors";
import { disconnectRealtime, syncRealtimeSession } from "../../shared/realtime";

const SESSION_USER_STORAGE_KEY = "office_workspace_session_user_id";
const DEFAULT_USER_ID = "u01";

export interface SessionContextValue {
  currentUser: User | null;
  currentUserId: string;
  users: User[];
  isManager: boolean;
  isDeputy: boolean;
  isLeader: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isLoading: boolean;
  error: AppError | null;
  switchUser: (userId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isMockMode: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [mockUserId, setMockUserId] = useState<string>(() => {
    try {
      return localStorage.getItem(SESSION_USER_STORAGE_KEY) || DEFAULT_USER_ID;
    } catch {
      return DEFAULT_USER_ID;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AppError | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!isMockMode) return;
    try {
      setIsLoading(true);
      setError(null);
      const userList = await mockRepository.getUsers();
      setUsers(userList);
    } catch (err) {
      if (err instanceof DomainError) {
        setError(err.toAppError());
      } else {
        setError({
          code: "MOCK_FAILURE",
          message: err instanceof Error ? err.message : "Không thể tải danh sách tài khoản demo",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (isMockMode) {
      await fetchUsers();
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const refreshed = await apiClient.refresh();
      if (!refreshed) {
        setCurrentUser(null);
        setUsers([]);
        httpRepository.setIdentity(null);
        return;
      }
      const me = await apiClient.request<User>("/auth/me");
      const visibleUsers = me.role === "MANAGER" || me.role === "DEPUTY_MANAGER"
        ? await httpRepository.getUsers()
        : [me];
      setCurrentUser(me);
      setUsers(visibleUsers);
      httpRepository.setIdentity(me as User & { status: "ACTIVE" | "LOCKED"; role: "MANAGER" | "DEPUTY_MANAGER" | "STAFF" });
    } catch (err) {
      if (err instanceof ApiError) setError(err.toAppError());
      else setError({ code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Không thể kiểm tra phiên đăng nhập" });
      setCurrentUser(null);
      setUsers([]);
      httpRepository.setIdentity(null);
    } finally {
      setIsLoading(false);
    }
  }, [fetchUsers]);

  const login = useCallback(async (email: string, password: string) => {
    if (isMockMode) {
      const candidate = users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
      if (!candidate) throw new Error("Tài khoản demo không tồn tại.");
      await switchUser(candidate.id);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.login(email, password);
      const me = await apiClient.request<User>("/auth/me");
      const visibleUsers = me.role === "MANAGER" || me.role === "DEPUTY_MANAGER"
        ? await httpRepository.getUsers()
        : [me];
      setCurrentUser(me);
      setUsers(visibleUsers);
      httpRepository.setIdentity(me as User & { status: "ACTIVE" | "LOCKED"; role: "MANAGER" | "DEPUTY_MANAGER" | "STAFF" });
    } catch (err) {
      if (err instanceof ApiError) setError(err.toAppError());
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [users]);

  const logout = useCallback(async () => {
    if (isMockMode) {
      setCurrentUser(null);
      return;
    }
    await apiClient.logout();
    setCurrentUser(null);
    setUsers([]);
    httpRepository.setIdentity(null);
  }, []);

  useEffect(() => {
    if (isMockMode) {
      fetchUsers().then(() => setCurrentUser(mockRepository.getSnapshot().users.find((user) => user.id === mockUserId) ?? null));
      return mockRepository.subscribe(() => {
        fetchUsers().then(() => setCurrentUser(mockRepository.getSnapshot().users.find((user) => user.id === mockUserId) ?? null));
      });
    }
    void refreshSession();
  }, [fetchUsers, mockUserId, refreshSession]);

  useEffect(() => {
    if (isMockMode) return;
    return apiClient.onSession((session) => {
      if (session) {
        syncRealtimeSession(session, () => httpRepository.notifyDataChanged());
        return;
      }
      disconnectRealtime();
      setCurrentUser(null);
      setUsers([]);
      httpRepository.setIdentity(null);
    });
  }, []);

  const switchUser = useCallback(async (userId: string) => {
    if (!isMockMode) throw new ApiError("VALIDATION", "Không thể chuyển tài khoản trong phiên API. Hãy đăng xuất và đăng nhập lại.");
    setMockUserId(userId);
    const user = users.find((entry) => entry.id === userId) ?? null;
    setCurrentUser(user);
    try {
      localStorage.setItem(SESSION_USER_STORAGE_KEY, userId);
    } catch (err) {
      console.warn("Failed to persist session to localStorage", err);
    }
  }, [users]);

  const value = useMemo<SessionContextValue>(
    () => ({
      currentUser,
      currentUserId: currentUser?.id || (isMockMode ? mockUserId : ""),
      users,
      isManager: currentUser?.role === "MANAGER",
      isDeputy: currentUser?.role === "DEPUTY_MANAGER",
      isLeader: currentUser?.role === "MANAGER" || currentUser?.role === "DEPUTY_MANAGER",
      isAdmin: currentUser?.role === "MANAGER",
      isStaff: currentUser?.role === "STAFF",
      isLoading,
      error,
      switchUser,
      refreshSession,
      login,
      logout,
      isMockMode,
    }),
    [currentUser, mockUserId, users, isLoading, error, switchUser, refreshSession, login, logout]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
