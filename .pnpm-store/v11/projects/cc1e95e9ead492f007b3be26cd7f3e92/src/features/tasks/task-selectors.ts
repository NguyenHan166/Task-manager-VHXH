import type {
  Id,
  Notification,
  Task,
  TaskEvent,
  TaskParticipant,
  User,
} from "../../shared/data-contract";
import { canSeeTask, isTaskOverdue } from "../../shared/data-contract";

export { canSeeTask, isTaskOverdue };

export interface ManagerDashboardStats {
  /**
   * Published active OFFICIAL tasks (excludes DRAFT and CANCELLED).
   * In initial seed: 7 tasks (2 TODO, 2 IN_PROGRESS, 1 IN_REVIEW, 2 DONE).
   */
  totalActivePublished: number;
  todoCount: number;
  inProgressCount: number;
  inReviewCount: number;
  doneCount: number;
  /**
   * Tasks with status not in [DRAFT, DONE, CANCELLED] whose dueAt is past.
   * In initial seed: 1 task (t04).
   */
  overdueCount: number;
  /**
   * DONE tasks completed on or before dueAt.
   * In initial seed: 1 of 2 DONE tasks (t05).
   */
  completedOnTimeCount: number;
  /**
   * Draft official tasks (excluded from active published KPI).
   */
  draftCount: number;
  /**
   * Cancelled official tasks (excluded from active published KPI).
   */
  cancelledCount: number;
  /**
   * Total all OFFICIAL tasks in system (including draft and cancelled).
   */
  totalOfficialCount: number;
}

export interface StaffDashboardStats {
  /**
   * Total tasks where the staff user is the primary assignee (excluding CANCELLED).
   */
  totalAssigned: number;
  todoCount: number;
  inProgressCount: number;
  inReviewCount: number;
  doneCount: number;
  overdueCount: number;
  dueSoonCount: number;
  /**
   * Count of tasks where the staff is an accepted collaborator (not primary assignee).
   */
  collaboratingCount: number;
  /**
   * Count of personal tasks owned by this staff member.
   */
  personalCount: number;
}

export interface UserWorkloadStats {
  user: User;
  primaryCount: number; // Official tasks where primaryAssigneeId === user.id (active published)
  collabCount: number; // Active tasks where user is accepted collaborator
  doneCount: number; // Official DONE tasks
  doneOnTimeCount: number; // Official DONE on time
  onTimeRate: number; // integer 0..100 (doneOnTimeCount / doneCount * 100) or 0
  overdueCount: number; // Active tasks overdue
}

export interface PriorityBreakdown {
  URGENT: number;
  HIGH: number;
  NORMAL: number;
  LOW: number;
}

export interface CalendarDayBucket {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  dayLabel: string; // Thứ 2, Thứ 3,...
  formattedDate: string; // 26/10
  isToday: boolean;
  tasks: Task[];
}

/**
 * Filter tasks visible to the current viewer based on permission rules.
 */
export function getVisibleTasks(
  tasks: Task[],
  viewer: User,
  participants: TaskParticipant[]
): Task[] {
  return tasks.filter((task) => canSeeTask(task, viewer, participants));
}

/**
 * Check if a task is due soon (within given hours from now, e.g. 48h) and not yet finished.
 */
export function isTaskDueSoon(
  task: Task,
  hoursAhead = 48,
  now: Date = new Date()
): boolean {
  if (!task.dueAt) return false;
  if (["DRAFT", "DONE", "CANCELLED"].includes(task.status)) return false;
  const dueTime = new Date(task.dueAt).getTime();
  const nowTime = now.getTime();
  const diffHours = (dueTime - nowTime) / 3_600_000;
  return diffHours >= 0 && diffHours <= hoursAhead;
}

/**
 * Calculate Manager KPI metrics:
 * Default view strictly takes published, active OFFICIAL tasks (excludes DRAFT and CANCELLED).
 * Personal and Team tasks are strictly excluded. Collaborators do not duplicate task counts.
 */
export function getManagerDashboardStats(
  tasks: Task[],
  now: Date = new Date()
): ManagerDashboardStats {
  // Only look at OFFICIAL tasks
  const officialTasks = tasks.filter((t) => t.type === "OFFICIAL");

  let draftCount = 0;
  let cancelledCount = 0;
  let todoCount = 0;
  let inProgressCount = 0;
  let inReviewCount = 0;
  let doneCount = 0;
  let overdueCount = 0;
  let completedOnTimeCount = 0;

  officialTasks.forEach((t) => {
    if (t.status === "DRAFT") {
      draftCount++;
      return;
    }
    if (t.status === "CANCELLED") {
      cancelledCount++;
      return;
    }

    // Active published tasks
    switch (t.status) {
      case "TODO":
        todoCount++;
        break;
      case "IN_PROGRESS":
        inProgressCount++;
        break;
      case "IN_REVIEW":
        inReviewCount++;
        break;
      case "DONE":
        doneCount++;
        if (t.completedAt && t.dueAt) {
          const completedTime = new Date(t.completedAt).getTime();
          const dueTime = new Date(t.dueAt).getTime();
          if (completedTime <= dueTime) {
            completedOnTimeCount++;
          }
        }
        break;
    }

    if (isTaskOverdue(t, now)) {
      overdueCount++;
    }
  });

  const totalActivePublished = todoCount + inProgressCount + inReviewCount + doneCount;

  return {
    totalActivePublished,
    todoCount,
    inProgressCount,
    inReviewCount,
    doneCount,
    overdueCount,
    completedOnTimeCount,
    draftCount,
    cancelledCount,
    totalOfficialCount: officialTasks.length,
  };
}

/**
 * Calculate Staff KPI metrics:
 * Focuses on tasks assigned to the staff user, plus distinct counts for collaborating and personal.
 */
export function getStaffDashboardStats(
  tasks: Task[],
  viewer: User,
  participants: TaskParticipant[],
  now: Date = new Date()
): StaffDashboardStats {
  const assignedTasks = tasks.filter(
    (t) => t.primaryAssigneeId === viewer.id && t.status !== "CANCELLED"
  );

  let todoCount = 0;
  let inProgressCount = 0;
  let inReviewCount = 0;
  let doneCount = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;

  assignedTasks.forEach((t) => {
    switch (t.status) {
      case "TODO":
        todoCount++;
        break;
      case "IN_PROGRESS":
        inProgressCount++;
        break;
      case "IN_REVIEW":
        inReviewCount++;
        break;
      case "DONE":
        doneCount++;
        break;
    }

    if (isTaskOverdue(t, now)) {
      overdueCount++;
    } else if (isTaskDueSoon(t, 48, now)) {
      dueSoonCount++;
    }
  });

  // Distinct tasks where user is accepted collaborator (and not primary assignee)
  const collaboratingTaskIds = new Set(
    participants
      .filter(
        (p) =>
          p.userId === viewer.id &&
          p.role === "COLLABORATOR" &&
          p.invitationStatus === "ACCEPTED"
      )
      .map((p) => p.taskId)
  );

  const collaboratingCount = tasks.filter(
    (t) => collaboratingTaskIds.has(t.id) && t.primaryAssigneeId !== viewer.id && t.status !== "CANCELLED"
  ).length;

  const personalCount = tasks.filter(
    (t) => t.type === "PERSONAL" && t.createdById === viewer.id && t.status !== "CANCELLED"
  ).length;

  return {
    totalAssigned: assignedTasks.length,
    todoCount,
    inProgressCount,
    inReviewCount,
    doneCount,
    overdueCount,
    dueSoonCount,
    collaboratingCount,
    personalCount,
  };
}

/**
 * Calculate workload and on-time completion stats by staff member (primary assignee).
 * Separates primary assignments and collaboration roles clearly.
 */
export function getUserWorkloadStats(
  tasks: Task[],
  users: User[],
  participants: TaskParticipant[],
  now: Date = new Date()
): UserWorkloadStats[] {
  // Only evaluate staff members (or all active users)
  const staffUsers = users.filter((u) => u.status === "ACTIVE");

  return staffUsers.map((user) => {
    // Official active published tasks assigned to this user
    const primaryOfficial = tasks.filter(
      (t) =>
        t.type === "OFFICIAL" &&
        t.primaryAssigneeId === user.id &&
        t.status !== "DRAFT" &&
        t.status !== "CANCELLED"
    );

    const doneTasks = primaryOfficial.filter((t) => t.status === "DONE");
    let doneOnTimeCount = 0;
    doneTasks.forEach((t) => {
      if (t.completedAt && t.dueAt) {
        if (new Date(t.completedAt).getTime() <= new Date(t.dueAt).getTime()) {
          doneOnTimeCount++;
        }
      }
    });

    const overdueCount = primaryOfficial.filter((t) => isTaskOverdue(t, now)).length;

    // Collaboration count from accepted invitations
    const userCollabTaskIds = new Set(
      participants
        .filter(
          (p) =>
            p.userId === user.id &&
            p.role === "COLLABORATOR" &&
            p.invitationStatus === "ACCEPTED"
        )
        .map((p) => p.taskId)
    );

    const collabCount = tasks.filter(
      (t) =>
        userCollabTaskIds.has(t.id) &&
        t.primaryAssigneeId !== user.id &&
        t.status !== "CANCELLED" &&
        t.status !== "DRAFT"
    ).length;

    const onTimeRate =
      doneTasks.length > 0 ? Math.round((doneOnTimeCount / doneTasks.length) * 100) : 0;

    return {
      user,
      primaryCount: primaryOfficial.length,
      collabCount,
      doneCount: doneTasks.length,
      doneOnTimeCount,
      onTimeRate,
      overdueCount,
    };
  });
}

/**
 * Priority breakdown of tasks (counts by priority level).
 */
export function getPriorityBreakdown(tasks: Task[]): PriorityBreakdown {
  const breakdown: PriorityBreakdown = {
    URGENT: 0,
    HIGH: 0,
    NORMAL: 0,
    LOW: 0,
  };

  tasks.forEach((t) => {
    if (t.status !== "DRAFT" && t.status !== "CANCELLED") {
      if (breakdown[t.priority] !== undefined) {
        breakdown[t.priority]++;
      }
    }
  });

  return breakdown;
}

/**
 * Tasks requiring urgent attention from Manager:
 * - Overdue tasks
 * - Blocked tasks (vướng mắc)
 * - Urgent priority tasks (khẩn cấp)
 * - Tasks pending approval (IN_REVIEW)
 */
export function getManagerUrgentTasks(
  tasks: Task[],
  now: Date = new Date()
): Task[] {
  const candidates = tasks.filter((t) => {
    if (t.type !== "OFFICIAL") return false;
    if (t.status === "DRAFT" || t.status === "CANCELLED" || t.status === "DONE") return false;

    const isOverdue = isTaskOverdue(t, now);
    const isUrgentPriority = t.priority === "URGENT";
    const isReview = t.status === "IN_REVIEW";
    const isBlocked = t.isBlocked;

    return isOverdue || isUrgentPriority || isReview || isBlocked;
  });

  // Sort by urgency weight
  return candidates.sort((a, b) => {
    const aOverdue = isTaskOverdue(a, now);
    const bOverdue = isTaskOverdue(b, now);
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;

    if (a.isBlocked && !b.isBlocked) return -1;
    if (!a.isBlocked && b.isBlocked) return 1;

    if (a.priority === "URGENT" && b.priority !== "URGENT") return -1;
    if (a.priority !== "URGENT" && b.priority === "URGENT") return 1;

    return (a.dueAt ? new Date(a.dueAt).getTime() : 0) - (b.dueAt ? new Date(b.dueAt).getTime() : 0);
  });
}

/**
 * Staff Todo list:
 * Tasks where viewer is primary assignee or collaborator, sorted by urgency.
 */
export function getStaffTodoList(
  tasks: Task[],
  viewer: User,
  participants: TaskParticipant[],
  now: Date = new Date()
): Task[] {
  const visible = tasks.filter((t) => canSeeTask(t, viewer, participants));

  const todoTasks = visible.filter((t) => {
    if (t.status === "CANCELLED" || t.status === "DRAFT") return false;
    // Don't clutter todo with finished personal/done tasks unless recently done
    if (t.status === "DONE") return false;
    return true;
  });

  return todoTasks.sort((a, b) => {
    const aOverdue = isTaskOverdue(a, now);
    const bOverdue = isTaskOverdue(b, now);
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;

    if (a.priority === "URGENT" && b.priority !== "URGENT") return -1;
    if (a.priority !== "URGENT" && b.priority === "URGENT") return 1;

    const aDueSoon = isTaskDueSoon(a, 48, now);
    const bDueSoon = isTaskDueSoon(b, 48, now);
    if (aDueSoon && !bDueSoon) return -1;
    if (!aDueSoon && bDueSoon) return 1;

    return (a.dueAt ? new Date(a.dueAt).getTime() : 0) - (b.dueAt ? new Date(b.dueAt).getTime() : 0);
  });
}

/**
 * Generates mini 7-day week calendar for Staff dashboard based on due dates.
 */
export function getStaffWeekCalendar(
  tasks: Task[],
  viewer: User,
  participants: TaskParticipant[],
  baseDate: Date = new Date()
): CalendarDayBucket[] {
  // Visible tasks only
  const visible = tasks.filter((t) => canSeeTask(t, viewer, participants));

  // Determine Monday of current week
  const curr = new Date(baseDate);
  const dayOfWeek = curr.getDay(); // 0 is Sunday, 1 is Monday
  const distanceToMonday = (dayOfWeek + 6) % 7; // distance from Monday
  const monday = new Date(curr);
  monday.setDate(curr.getDate() - distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const daysLabels = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
  const buckets: CalendarDayBucket[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const dateNum = String(d.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${dateNum}`;

    const isToday =
      d.getDate() === baseDate.getDate() &&
      d.getMonth() === baseDate.getMonth() &&
      d.getFullYear() === baseDate.getFullYear();

    const matchingTasks = visible.filter((t) => {
      if (!t.dueAt) return false;
      const tDate = new Date(t.dueAt);
      return (
        tDate.getDate() === d.getDate() &&
        tDate.getMonth() === d.getMonth() &&
        tDate.getFullYear() === d.getFullYear()
      );
    });

    buckets.push({
      date: d,
      dateKey,
      dayLabel: daysLabels[i],
      formattedDate: `${dateNum}/${month}`,
      isToday,
      tasks: matchingTasks,
    });
  }

  return buckets;
}

/**
 * Calculate unread notification count for a user.
 */
export function getUnreadCount(notifications: Notification[], userId: Id): number {
  return notifications.filter((n) => n.recipientId === userId && !n.readAt).length;
}

/**
 * Get sorted chronological timeline of events for a task (newest first).
 */
export function getTaskTimeline(taskId: Id, events: TaskEvent[]): TaskEvent[] {
  return events
    .filter((e) => e.taskId === taskId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
