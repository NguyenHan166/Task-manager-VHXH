/**
 * Clock helper and timezone formatter for Office Workspace.
 * Internal exchange format: ISO 8601 UTC.
 * Display format: Asia/Ho_Chi_Minh (UTC+7).
 */

export const TIMEZONE_VN = "Asia/Ho_Chi_Minh";

/**
 * Returns an ISO UTC string for the provided Date or current time.
 */
export function toIsoUtc(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Returns standardized YYYY-MM-DD date key in Asia/Ho_Chi_Minh timezone.
 * Used for date grouping, date matching, and calendar grids.
 */
export function toDateKeyVN(date: string | Date | null | undefined): string {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE_VN,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

/**
 * Format ISO datetime string or Date to VN display (e.g., "16:00 26/10/2026").
 */
export function formatDateTimeVN(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: TIMEZONE_VN,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour12: false,
    }).format(d);
  } catch {
    return "—";
  }
}

/**
 * Format ISO datetime or Date to date only (e.g., "26/10/2026").
 */
export function formatDateVN(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: TIMEZONE_VN,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return "—";
  }
}

/**
 * Format ISO datetime or Date to time only (e.g., "16:00").
 */
export function formatTimeVN(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: TIMEZONE_VN,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "—";
  }
}

/**
 * Friendly relative time display in Vietnamese (e.g. "2 giờ trước", "Trong 3 giờ", "Hôm nay 16:00").
 */
export function formatRelativeVN(iso: string | Date | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  try {
    const target = typeof iso === "string" ? new Date(iso) : iso;
    if (isNaN(target.getTime())) return "—";

    const diffMs = target.getTime() - now.getTime();
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHours = Math.round(diffMin / 60);
    const diffDays = Math.round(diffHours / 24);

    if (Math.abs(diffSec) < 45) return "Vừa xong";

    if (diffMs < 0) {
      // Past
      const absDays = Math.abs(diffDays);
      const absHours = Math.abs(diffHours);
      const absMin = Math.abs(diffMin);

      if (absMin < 60) return `${absMin} phút trước`;
      if (absHours < 24) return `${absHours} giờ trước`;
      if (absDays === 1) return `Hôm qua ${formatTimeVN(target)}`;
      if (absDays < 7) return `${absDays} ngày trước`;
      return formatDateVN(target);
    } else {
      // Future
      if (diffMin < 60) return `Trong ${diffMin} phút nữa`;
      if (diffHours < 24) return `Trong ${diffHours} giờ nữa`;
      if (diffDays === 1) return `Ngày mai ${formatTimeVN(target)}`;
      if (diffDays < 7) return `${diffDays} ngày nữa`;
      return formatDateVN(target);
    }
  } catch {
    return "—";
  }
}

/**
 * Checks if a task dueAt is overdue relative to `now`.
 */
export function isOverdueDate(dueAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const d = new Date(dueAt);
  return !isNaN(d.getTime()) && d.getTime() < now.getTime();
}

/**
 * Checks if a task is due within a given number of hours.
 */
export function isDueSoonDate(dueAt: string | null | undefined, hours = 24, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const d = new Date(dueAt);
  if (isNaN(d.getTime())) return false;
  const diffHours = (d.getTime() - now.getTime()) / 3_600_000;
  return diffHours > 0 && diffHours <= hours;
}
