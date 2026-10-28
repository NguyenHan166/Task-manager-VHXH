import { useCallback, useEffect, useState } from "react";
import type {
  AppSettings,
  AppError,
  Page,
  Task,
  TaskParticipant,
  TaskQuery,
} from "../../shared/data-contract";
import { workspaceRepository, httpRepository, isMockMode } from "../../shared/repository";
import { taskService } from "./task-service";
import { useSession } from "../auth/SessionContext";
import {
  getManagerDashboardStats,
  getStaffDashboardStats,
  type ManagerDashboardStats,
  type StaffDashboardStats,
} from "./task-selectors";
import { DomainError } from "../../shared/errors";

export function useTasks(customQuery?: Partial<TaskQuery>) {
  const { currentUser } = useSession();
  const [data, setData] = useState<Page<Task>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AppError | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!currentUser) return;
    try {
      setIsLoading(true);
      setError(null);

      const query: TaskQuery = {
        page: 1,
        pageSize: 10,
        ...customQuery,
      };

      const result = await taskService.queryTasks(query, currentUser);
      setData(result);
    } catch (err) {
      if (err instanceof DomainError) {
        setError(err.toAppError());
      } else {
        setError({
          code: "MOCK_FAILURE",
          message: err instanceof Error ? err.message : "Không thể tải danh sách công việc",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, JSON.stringify(customQuery)]);

  useEffect(() => {
    fetchTasks();
      const unsubscribe = workspaceRepository.subscribe(() => {
      fetchTasks();
    });
    return unsubscribe;
  }, [fetchTasks]);

  return {
    ...data,
    isLoading,
    error,
    refetch: fetchTasks,
  };
}

export function useTaskStats() {
  const { currentUser } = useSession();
  const [managerStats, setManagerStats] = useState<ManagerDashboardStats | null>(null);
  const [staffStats, setStaffStats] = useState<StaffDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AppError | null>(null);

  const calculateStats = useCallback(async () => {
    if (!currentUser) return;
    try {
      setIsLoading(true);
      setError(null);

      if (isMockMode) {
        const [allTasks, participants] = await Promise.all([
          workspaceRepository.getTasks(),
          workspaceRepository.getParticipants(),
        ]);
        const now = new Date();
        setManagerStats(getManagerDashboardStats(allTasks, now));
        setStaffStats(getStaffDashboardStats(allTasks, currentUser, participants, now));
      } else {
        const stats = await httpRepository.getDashboardStats(currentUser.role === "STAFF" ? "STAFF" : "DEPT");
        if (currentUser.role === "STAFF") {
          setStaffStats(stats as unknown as StaffDashboardStats);
          setManagerStats(null);
        } else {
          setManagerStats(stats as unknown as ManagerDashboardStats);
          setStaffStats(null);
        }
      }
    } catch (err) {
      if (err instanceof DomainError) {
        setError(err.toAppError());
      } else {
        setError({
          code: "MOCK_FAILURE",
          message: err instanceof Error ? err.message : "Lỗi khi tính toán số liệu thống kê",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    calculateStats();
    const unsubscribe = workspaceRepository.subscribe(() => {
      calculateStats();
    });
    return unsubscribe;
  }, [calculateStats]);

  return {
    managerStats,
    staffStats,
    isLoading,
    error,
    refetch: calculateStats,
  };
}

export function useWorkspaceSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AppError | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const s = await workspaceRepository.getSettings();
      setSettings(s);
    } catch (err) {
      if (err instanceof DomainError) {
        setError(err.toAppError());
      } else {
        setError({
          code: "MOCK_FAILURE",
          message: "Lỗi tải cài đặt workspace",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    const unsubscribe = workspaceRepository.subscribe(() => {
      fetchSettings();
    });
    return unsubscribe;
  }, [fetchSettings]);

  return { settings, isLoading, error, refetch: fetchSettings };
}

export function useParticipants(taskId?: string) {
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    workspaceRepository
      .getParticipants(taskId)
      .then(setParticipants)
      .finally(() => setIsLoading(false));
  }, [taskId]);

  return { participants, isLoading };
}
