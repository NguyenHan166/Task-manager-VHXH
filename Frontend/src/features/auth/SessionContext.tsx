import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import type { AppError, User } from "../../shared/data-contract";
import { mockRepository } from "../../mocks/mock-repository";
import { DomainError } from "../../shared/errors";

const SESSION_USER_STORAGE_KEY = "office_workspace_session_user_id";
const DEFAULT_USER_ID = "u01"; // Trưởng phòng Nguyễn Văn An

export interface SessionContextValue {
  currentUser: User | null;
  currentUserId: string;
  users: User[];
  isManager: boolean;
  isStaff: boolean;
  isLoading: boolean;
  error: AppError | null;
  switchUser: (userId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    try {
      return localStorage.getItem(SESSION_USER_STORAGE_KEY) || DEFAULT_USER_ID;
    } catch {
      return DEFAULT_USER_ID;
    }
  });

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AppError | null>(null);

  const fetchUsers = useCallback(async () => {
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

  useEffect(() => {
    fetchUsers();

    // Listen to repository resets or updates
    const unsubscribe = mockRepository.subscribe(() => {
      fetchUsers();
    });

    return unsubscribe;
  }, [fetchUsers]);

  const currentUser = useMemo(() => {
    return users.find((u) => u.id === currentUserId) || users[0] || null;
  }, [users, currentUserId]);

  const switchUser = useCallback(async (userId: string) => {
    setCurrentUserId(userId);
    try {
      localStorage.setItem(SESSION_USER_STORAGE_KEY, userId);
    } catch (err) {
      console.warn("Failed to persist session to localStorage", err);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      currentUser,
      currentUserId: currentUser?.id || currentUserId,
      users,
      isManager: currentUser?.role === "MANAGER",
      isStaff: currentUser?.role === "STAFF",
      isLoading,
      error,
      switchUser,
      refreshSession: fetchUsers,
    }),
    [currentUser, currentUserId, users, isLoading, error, switchUser, fetchUsers]
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
