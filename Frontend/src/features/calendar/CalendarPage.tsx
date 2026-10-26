import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import { canSeeTask, isTaskOverdue } from "../../shared/data-contract";
import type { Task, TaskParticipant } from "../../shared/data-contract";
import {
  Breadcrumb,
  Button,
  StatusBadge,
  PriorityBadge,
  TaskTypeBadge,
  UserAvatar,
  OverdueBadge,
} from "../../components/ui";
import { formatDateVN, formatTimeVN } from "../../shared/datetime";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Columns3,
  CalendarDays,
  CalendarRange,
  ListChecks,
  ArrowUpRight,
} from "lucide-react";

type CalendarViewMode = "MONTH" | "WEEK" | "DAY" | "AGENDA";
type CalendarScope = "OWNED" | "COLLABORATING" | "ALL";

export function CalendarPage() {
  const { currentUser, isManager, users } = useSession();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewMode, setViewMode] = useState<CalendarViewMode>("MONTH");
  const [scope, setScope] = useState<CalendarScope>("OWNED");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedMobileDate, setSelectedMobileDate] = useState<Date>(() => new Date());

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tList, pList] = await Promise.all([
        mockRepository.getTasks(),
        mockRepository.getParticipants(),
      ]);
      setTasks(tList);
      setParticipants(pList);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = mockRepository.subscribe(loadData);
    return unsub;
  }, []);

  // Filter tasks with valid dueAt and permission
  const calendarTasks = useMemo(() => {
    if (!currentUser) return [];

    // Filter by permission first and MUST have dueAt
    let filtered = tasks
      .filter((t) => !!t.dueAt)
      .filter((t) => canSeeTask(t, currentUser, participants));

    // Filter by scope
    if (scope === "OWNED") {
      filtered = filtered.filter(
        (t) => t.primaryAssigneeId === currentUser.id || t.createdById === currentUser.id
      );
    } else if (scope === "COLLABORATING") {
      const collabTaskIds = new Set(
        participants
          .filter(
            (p) =>
              p.userId === currentUser.id &&
              p.role === "COLLABORATOR" &&
              p.invitationStatus === "ACCEPTED"
          )
          .map((p) => p.taskId)
      );
      filtered = filtered.filter((t) => collabTaskIds.has(t.id));
    }
    // "ALL" scope is only allowed for manager (already guarded in render)

    return filtered;
  }, [tasks, participants, currentUser, scope]);

  // Navigate dates
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === "MONTH") {
      next.setMonth(next.getMonth() - 1);
    } else if (viewMode === "WEEK") {
      next.setDate(next.getDate() - 7);
    } else {
      next.setDate(next.getDate() - 1);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === "MONTH") {
      next.setMonth(next.getMonth() + 1);
    } else if (viewMode === "WEEK") {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + 1);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Format header title
  const calendarTitle = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    if (viewMode === "MONTH") {
      return `Tháng ${month}, Năm ${year}`;
    }
    if (viewMode === "WEEK") {
      // Calculate start and end of week (Monday to Sunday)
      const curr = new Date(currentDate);
      const day = curr.getDay();
      const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(curr.setDate(diff));
      const sunday = new Date(curr.setDate(monday.getDate() + 6));
      return `Tuần từ ${monday.getDate()}/${monday.getMonth() + 1} đến ${sunday.getDate()}/${sunday.getMonth() + 1}/${year}`;
    }
    if (viewMode === "AGENDA") {
      return `Lịch trình công việc (${calendarTasks.length} nhiệm vụ)`;
    }
    return `Ngày ${currentDate.getDate()} tháng ${month}, ${year}`;
  }, [currentDate, viewMode, calendarTasks.length]);

  // Group tasks by date string (YYYY-MM-DD) for Agenda view
  const agendaGroupedTasks = useMemo(() => {
    const groups: { dateKey: string; date: Date; tasks: Task[] }[] = [];
    const map = new Map<string, { date: Date; tasks: Task[] }>();

    // Sort tasks by dueAt ascending
    const sorted = [...calendarTasks].sort(
      (a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime()
    );

    sorted.forEach((t) => {
      if (!t.dueAt) return;
      const d = new Date(t.dueAt);
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) {
        map.set(key, { date: d, tasks: [] });
      }
      map.get(key)!.tasks.push(t);
    });

    map.forEach((val, key) => {
      groups.push({ dateKey: key, date: val.date, tasks: val.tasks });
    });

    return groups;
  }, [calendarTasks]);

  // Month grid days (Monday to Sunday)
  const monthGridDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Day of week for 1st of month: 0=Sun, 1=Mon, ..., 6=Sat
    let startDayOfWeek = firstDay.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // 0=Mon, 6=Sun

    const days = [];

    // Days from previous month
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Days of current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }

    // Days of next month to complete the 35 or 42 grid
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining && days.length < 42; d++) {
      days.push({
        date: new Date(year, month + 1, d),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate]);

  // Week days
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(curr.setDate(diff));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  // Helper to find tasks on a given date (Asia/Ho_Chi_Minh)
  const getTasksOnDate = (date: Date) => {
    const dateStr = date.toISOString().slice(0, 10);
    return calendarTasks.filter((t) => {
      if (!t.dueAt) return false;
      const tDate = new Date(t.dueAt).toISOString().slice(0, 10);
      return tDate === dateStr;
    });
  };

  const isToday = (d: Date) => {
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Lịch công việc" }]} />

        {/* Top Control Bar */}
        <div className="bg-surface p-4 sm:p-5 rounded-card border border-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary tracking-tight">{calendarTitle}</h2>
              <div className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Múi giờ hiển thị: <strong>Asia/Ho_Chi_Minh (UTC+7)</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Scope Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-btn text-xs font-semibold">
              <button
                onClick={() => setScope("OWNED")}
                className={`px-3 py-1.5 rounded-btn transition-colors ${
                  scope === "OWNED"
                    ? "bg-white text-text-primary shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Của tôi
              </button>
              <button
                onClick={() => setScope("COLLABORATING")}
                className={`px-3 py-1.5 rounded-btn transition-colors ${
                  scope === "COLLABORATING"
                    ? "bg-white text-text-primary shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Phối hợp
              </button>
              {isManager && (
                <button
                  onClick={() => setScope("ALL")}
                  className={`px-3 py-1.5 rounded-btn transition-colors ${
                    scope === "ALL"
                      ? "bg-white text-brand-800 shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Toàn phòng
                </button>
              )}
            </div>

            {/* View Mode Buttons */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-btn text-xs font-semibold">
              <button
                onClick={() => setViewMode("MONTH")}
                className={`px-2.5 py-1.5 rounded-btn flex items-center gap-1 transition-colors ${
                  viewMode === "MONTH"
                    ? "bg-white text-brand-800 shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" /> Tháng
              </button>
              <button
                onClick={() => setViewMode("WEEK")}
                className={`px-2.5 py-1.5 rounded-btn flex items-center gap-1 transition-colors ${
                  viewMode === "WEEK"
                    ? "bg-white text-brand-800 shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" /> Tuần
              </button>
              <button
                onClick={() => setViewMode("DAY")}
                className={`px-2.5 py-1.5 rounded-btn flex items-center gap-1 transition-colors ${
                  viewMode === "DAY"
                    ? "bg-white text-brand-800 shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" /> Ngày
              </button>
              <button
                onClick={() => setViewMode("AGENDA")}
                className={`px-2.5 py-1.5 rounded-btn flex items-center gap-1 transition-colors ${
                  viewMode === "AGENDA"
                    ? "bg-white text-brand-800 shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" /> Lịch trình
              </button>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={handleToday} className="text-xs px-2.5 h-8">
                Hôm nay
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                className="p-1.5 h-8 w-8 justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                className="p-1.5 h-8 w-8 justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* CALENDAR BODY */}
        {isLoading ? (
          <div className="h-96 bg-slate-100 rounded-card animate-pulse" />
        ) : viewMode === "MONTH" ? (
          /* MONTH VIEW */
          <div>
            {/* Desktop Month Grid (>= 768px) */}
            <div className="hidden md:block bg-surface rounded-card border border-border overflow-hidden shadow-xs">
              {/* Days of week header */}
              <div className="grid grid-cols-7 border-b border-border bg-slate-50 text-center text-xs font-bold text-text-muted py-2.5">
                <span>Thứ 2</span>
                <span>Thứ 3</span>
                <span>Thứ 4</span>
                <span>Thứ 5</span>
                <span>Thứ 6</span>
                <span className="text-amber-700">Thứ 7</span>
                <span className="text-red-700">Chủ nhật</span>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/80">
                {monthGridDays.map((item, idx) => {
                  const dayTasks = getTasksOnDate(item.date);
                  const today = isToday(item.date);

                  return (
                    <div
                      key={idx}
                      className={`min-h-[110px] p-2 flex flex-col justify-between transition-colors ${
                        item.isCurrentMonth ? "bg-white" : "bg-slate-50/50 text-text-muted"
                      } ${today ? "ring-2 ring-brand-700/60 ring-inset bg-brand-50/20" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                            today
                              ? "bg-brand-700 text-white"
                              : item.isCurrentMonth
                              ? "text-text-primary"
                              : "text-text-muted"
                          }`}
                        >
                          {item.date.getDate()}
                        </span>
                        {dayTasks.length > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-text-secondary">
                            {dayTasks.length}
                          </span>
                        )}
                      </div>

                      {/* Task Pills */}
                      <div className="space-y-1 overflow-y-auto max-h-[85px]">
                        {dayTasks.map((t) => {
                          const overdue = isTaskOverdue(t);
                          return (
                            <Link
                              key={t.id}
                              to={`/tasks/${t.id}`}
                              className={`block p-1 rounded text-[11px] font-medium border truncate transition-all ${
                                t.status === "DONE"
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 line-through"
                                  : overdue
                                  ? "bg-red-50 border-red-200 text-danger font-semibold"
                                  : t.type === "OFFICIAL"
                                  ? "bg-blue-50 border-blue-200 text-blue-900"
                                  : "bg-purple-50 border-purple-200 text-purple-900"
                              } hover:opacity-90`}
                              title={`[${t.code}] ${t.title} - Hạn: ${t.dueAt?.slice(11, 16)}`}
                            >
                              <span className="font-mono font-bold mr-1">[{t.code}]</span>
                              <span>{t.title}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile Compact Month View (< 768px) */}
            <div className="block md:hidden space-y-4">
              {/* Compact Date Picker */}
              <div className="bg-surface rounded-card border border-border p-3.5 shadow-xs">
                {/* Day of week abbreviations */}
                <div className="grid grid-cols-7 text-center text-xs font-bold text-text-muted pb-2 border-b border-border/70 mb-2">
                  <span>T2</span>
                  <span>T3</span>
                  <span>T4</span>
                  <span>T5</span>
                  <span>T6</span>
                  <span className="text-amber-700">T7</span>
                  <span className="text-red-700">CN</span>
                </div>

                {/* 7-column Circular Day Picker */}
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {monthGridDays.map((item, idx) => {
                    const dayTasks = getTasksOnDate(item.date);
                    const today = isToday(item.date);
                    const isSelected =
                      selectedMobileDate.toISOString().slice(0, 10) ===
                      item.date.toISOString().slice(0, 10);
                    const hasOverdue = dayTasks.some((t) => isTaskOverdue(t));

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedMobileDate(item.date)}
                        className={`h-11 w-full flex flex-col items-center justify-center rounded-xl transition-all relative ${
                          isSelected
                            ? "bg-brand-700 text-white font-bold shadow-xs"
                            : today
                            ? "ring-2 ring-brand-700 font-bold text-brand-700 bg-brand-50/50"
                            : item.isCurrentMonth
                            ? "text-text-primary hover:bg-slate-100 font-medium"
                            : "text-text-muted opacity-35"
                        }`}
                      >
                        <span className="text-xs leading-none">{item.date.getDate()}</span>
                        {dayTasks.length > 0 && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                              hasOverdue
                                ? "bg-red-500 ring-1 ring-white"
                                : isSelected
                                ? "bg-white"
                                : "bg-brand-600"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mobile Selected Date Task List */}
              <div className="bg-surface rounded-card border border-border p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                  <div className="font-bold text-sm text-text-primary flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-brand-700" />
                    <span>Hạn nộp ngày {formatDateVN(selectedMobileDate.toISOString())}</span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-text-secondary">
                    {getTasksOnDate(selectedMobileDate).length} việc
                  </span>
                </div>

                {getTasksOnDate(selectedMobileDate).length === 0 ? (
                  <div className="py-6 text-center text-xs text-text-muted italic space-y-1">
                    <p>Không có nhiệm vụ nào đến hạn vào ngày này.</p>
                    <p className="text-[11px] text-text-muted/80">
                      Bấm vào các ngày có dấu chấm màu trên lịch để xem công việc.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {getTasksOnDate(selectedMobileDate).map((t) => {
                      const overdue = isTaskOverdue(t);
                      const u = users.find((user) => user.id === t.primaryAssigneeId);

                      return (
                        <div
                          key={t.id}
                          className="p-3 rounded-lg border border-border bg-slate-50/60 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-xs bg-white border border-border px-1.5 py-0.5 rounded">
                                {t.code}
                              </span>
                              <TaskTypeBadge type={t.type} />
                              {overdue && <OverdueBadge />}
                            </div>
                            <StatusBadge status={t.status} />
                          </div>

                          <Link
                            to={`/tasks/${t.id}`}
                            className="font-bold text-sm text-text-primary hover:text-brand-700 block line-clamp-2 leading-snug"
                          >
                            {t.title}
                          </Link>

                          <div className="flex items-center justify-between text-xs text-text-secondary pt-1 border-t border-border/60">
                            <div className="flex items-center gap-1.5">
                              <UserAvatar user={u} size="sm" />
                              <span className="truncate max-w-[120px]">{u?.displayName || "—"}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-brand-700">
                                {formatTimeVN(t.dueAt)}
                              </span>
                              <Link
                                to={`/tasks/${t.id}`}
                                className="text-brand-700 font-semibold hover:underline flex items-center gap-0.5"
                              >
                                Chi tiết <ArrowUpRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === "WEEK" ? (
          /* WEEK VIEW */
          <div>
            {/* Desktop Week Grid (>= 768px) */}
            <div className="hidden md:block bg-surface rounded-card border border-border overflow-hidden shadow-xs">
              <div className="grid grid-cols-7 divide-x divide-border">
                {weekDays.map((d, idx) => {
                  const dayTasks = getTasksOnDate(d);
                  const today = isToday(d);
                  return (
                    <div key={idx} className="min-h-[400px] flex flex-col">
                      {/* Header */}
                      <div
                        className={`p-3 text-center border-b border-border ${
                          today ? "bg-brand-50/60" : "bg-slate-50"
                        }`}
                      >
                        <div className="text-xs font-bold text-text-muted">
                          {idx === 5 ? "Thứ 7" : idx === 6 ? "Chủ nhật" : `Thứ ${idx + 2}`}
                        </div>
                        <div
                          className={`text-sm font-bold mt-1 mx-auto w-7 h-7 flex items-center justify-center rounded-full ${
                            today ? "bg-brand-700 text-white" : "text-text-primary"
                          }`}
                        >
                          {d.getDate()}
                        </div>
                      </div>

                      {/* Task list for day */}
                      <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                        {dayTasks.length === 0 ? (
                          <div className="text-center text-[11px] text-text-muted py-6 italic">
                            Không có hạn
                          </div>
                        ) : (
                          dayTasks.map((t) => {
                            const overdue = isTaskOverdue(t);
                            return (
                              <Link
                                key={t.id}
                                to={`/tasks/${t.id}`}
                                className={`block p-2.5 rounded-btn border text-xs space-y-1 transition-all ${
                                  t.status === "DONE"
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                    : overdue
                                    ? "bg-red-50 border-red-200 text-danger"
                                    : "bg-white border-border text-text-primary hover:border-brand-300"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                                    {t.code}
                                  </span>
                                  <span className="text-[10px] text-text-muted">
                                    {t.dueAt?.slice(11, 16)}
                                  </span>
                                </div>
                                <div className="font-semibold line-clamp-2">{t.title}</div>
                              </Link>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile Week Strip (< 768px) */}
            <div className="block md:hidden space-y-4">
              {/* Horizontal 7-day strip */}
              <div className="bg-surface rounded-card border border-border p-3 shadow-xs">
                <div className="grid grid-cols-7 gap-1 text-center">
                  {weekDays.map((d, idx) => {
                    const dayTasks = getTasksOnDate(d);
                    const today = isToday(d);
                    const isSelected =
                      selectedMobileDate.toISOString().slice(0, 10) ===
                      d.toISOString().slice(0, 10);
                    const hasOverdue = dayTasks.some((t) => isTaskOverdue(t));

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedMobileDate(d)}
                        className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center transition-all ${
                          isSelected
                            ? "bg-brand-700 text-white font-bold shadow-xs"
                            : today
                            ? "ring-2 ring-brand-700 font-bold text-brand-700 bg-brand-50"
                            : "text-text-primary hover:bg-slate-100 font-medium"
                        }`}
                      >
                        <span className="text-[10px] opacity-80 uppercase">
                          {idx === 5 ? "T7" : idx === 6 ? "CN" : `T${idx + 2}`}
                        </span>
                        <span className="text-sm font-bold mt-0.5">{d.getDate()}</span>
                        {dayTasks.length > 0 && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full mt-1 ${
                              hasOverdue
                                ? "bg-red-500 ring-1 ring-white"
                                : isSelected
                                ? "bg-white"
                                : "bg-brand-600"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tasks for selected day of week */}
              <div className="bg-surface rounded-card border border-border p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                  <div className="font-bold text-sm text-text-primary flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-brand-700" />
                    <span>Hạn ngày {formatDateVN(selectedMobileDate.toISOString())}</span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-text-secondary">
                    {getTasksOnDate(selectedMobileDate).length} việc
                  </span>
                </div>

                {getTasksOnDate(selectedMobileDate).length === 0 ? (
                  <div className="py-6 text-center text-xs text-text-muted italic">
                    Không có nhiệm vụ nào đến hạn vào ngày này trong tuần.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {getTasksOnDate(selectedMobileDate).map((t) => {
                      const overdue = isTaskOverdue(t);
                      const u = users.find((user) => user.id === t.primaryAssigneeId);

                      return (
                        <div
                          key={t.id}
                          className="p-3 rounded-lg border border-border bg-slate-50/60 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-xs bg-white border border-border px-1.5 py-0.5 rounded">
                                {t.code}
                              </span>
                              <TaskTypeBadge type={t.type} />
                              {overdue && <OverdueBadge />}
                            </div>
                            <StatusBadge status={t.status} />
                          </div>

                          <Link
                            to={`/tasks/${t.id}`}
                            className="font-bold text-sm text-text-primary hover:text-brand-700 block line-clamp-2 leading-snug"
                          >
                            {t.title}
                          </Link>

                          <div className="flex items-center justify-between text-xs text-text-secondary pt-1 border-t border-border/60">
                            <div className="flex items-center gap-1.5">
                              <UserAvatar user={u} size="sm" />
                              <span className="truncate max-w-[120px]">{u?.displayName || "—"}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-brand-700">
                                {formatTimeVN(t.dueAt)}
                              </span>
                              <Link
                                to={`/tasks/${t.id}`}
                                className="text-brand-700 font-semibold hover:underline flex items-center gap-0.5"
                              >
                                Chi tiết <ArrowUpRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === "AGENDA" ? (
          /* AGENDA VIEW */
          <div className="space-y-4 max-w-3xl mx-auto">
            {agendaGroupedTasks.length === 0 ? (
              <div className="bg-surface rounded-card border border-border p-8 text-center text-xs text-text-muted space-y-2">
                <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-text-primary">Không có công việc nào có thời hạn</p>
                <p>Thử đổi bộ lọc phạm vi (Của tôi / Phối hợp / Toàn phòng) để xem thêm.</p>
              </div>
            ) : (
              agendaGroupedTasks.map((group) => {
                const today = isToday(group.date);
                const isPast = group.date.getTime() < new Date().setHours(0, 0, 0, 0);

                return (
                  <div
                    key={group.dateKey}
                    className="bg-surface rounded-card border border-border p-4 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border/70 pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold text-sm ${
                            today
                              ? "text-brand-700 flex items-center gap-1.5"
                              : isPast
                              ? "text-red-700"
                              : "text-text-primary"
                          }`}
                        >
                          {today && <span className="w-2 h-2 rounded-full bg-brand-700 animate-pulse" />}
                          {formatDateVN(group.date.toISOString())}
                        </span>
                        {today && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-800">
                            Hôm nay
                          </span>
                        )}
                        {isPast && !today && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-danger">
                            Đã qua hạn
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-text-muted font-medium">
                        {group.tasks.length} nhiệm vụ
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {group.tasks.map((t) => {
                        const overdue = isTaskOverdue(t);
                        const u = users.find((user) => user.id === t.primaryAssigneeId);

                        return (
                          <div
                            key={t.id}
                            className="p-3 rounded-lg border border-border/80 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-xs bg-white border border-border px-1.5 py-0.5 rounded">
                                  {t.code}
                                </span>
                                <TaskTypeBadge type={t.type} />
                                {overdue && <OverdueBadge />}
                              </div>
                              <StatusBadge status={t.status} />
                            </div>

                            <Link
                              to={`/tasks/${t.id}`}
                              className="font-bold text-sm text-text-primary hover:text-brand-700 block line-clamp-2 leading-snug"
                            >
                              {t.title}
                            </Link>

                            <div className="flex items-center justify-between text-xs text-text-secondary pt-1 border-t border-border/60">
                              <div className="flex items-center gap-1.5">
                                <UserAvatar user={u} size="sm" />
                                <span className="truncate max-w-[120px]">{u?.displayName || "—"}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-brand-700">
                                  {formatTimeVN(t.dueAt)}
                                </span>
                                <Link
                                  to={`/tasks/${t.id}`}
                                  className="text-brand-700 font-semibold hover:underline flex items-center gap-0.5"
                                >
                                  Xem chi tiết <ArrowUpRight className="w-3.5 h-3.5" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* DAY VIEW */
          <div className="bg-surface rounded-card border border-border p-4 sm:p-6 shadow-xs space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-text-primary">
                Công việc đến hạn ngày {currentDate.getDate()}/{currentDate.getMonth() + 1}/{currentDate.getFullYear()}
              </h3>
              <span className="text-xs text-text-muted">
                {getTasksOnDate(currentDate).length} nhiệm vụ
              </span>
            </div>

            {getTasksOnDate(currentDate).length === 0 ? (
              <div className="text-center py-12 text-text-muted text-xs">
                Không có nhiệm vụ nào đến hạn vào ngày này.
              </div>
            ) : (
              <div className="space-y-3">
                {getTasksOnDate(currentDate).map((t) => {
                  const u = users.find((user) => user.id === t.primaryAssigneeId);
                  const overdue = isTaskOverdue(t);
                  return (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-btn border border-border bg-slate-50/50 hover:bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded">
                            {t.code}
                          </span>
                          <TaskTypeBadge type={t.type} />
                          {overdue && <OverdueBadge />}
                          <StatusBadge status={t.status} />
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <Link
                          to={`/tasks/${t.id}`}
                          className="font-bold text-sm text-text-primary hover:text-brand-700 hover:underline block truncate"
                        >
                          {t.title}
                        </Link>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-0 border-border/60">
                        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                          <UserAvatar user={u} size="sm" />
                          <span className="truncate max-w-[100px]">{u?.displayName}</span>
                        </div>
                        <span className="font-mono font-bold text-xs text-brand-800">
                          {formatTimeVN(t.dueAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
