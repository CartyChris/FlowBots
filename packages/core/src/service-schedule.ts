export interface LocalClock {
  /** 0 = Sunday, 1 = Monday, ... 6 = Saturday. */
  weekday: number;
  /** Minutes since local midnight, 0..1439. */
  minuteOfDay: number;
}

export interface ScheduleWindow {
  /** Start-day weekdays. Omit to allow every day. */
  days?: number[];
  startMinute: number;
  endMinute: number;
  enabled?: boolean;
}

export type ScheduleClosePolicy = "drain" | "leave-active" | "terminate-active";
export type ScheduledServiceState = "running" | "draining" | "stopped";

export interface ScheduledServicePolicy {
  enabled: boolean;
  windows: ScheduleWindow[];
  closePolicy?: ScheduleClosePolicy;
}

export function isScheduleWindowActive(window: ScheduleWindow, clock: LocalClock): boolean {
  if (window.enabled === false) return false;
  const weekday = normalizeWeekday(clock.weekday);
  const minute = normalizeMinute(clock.minuteOfDay);
  const start = normalizeMinute(window.startMinute, true);
  const end = normalizeMinute(window.endMinute, true);
  const days = normalizedDays(window.days);

  if (start === end) return days.has(weekday);
  if (start < end) {
    return days.has(weekday) && minute >= start && minute < end;
  }

  // Overnight windows belong to their start day. Example: Friday 22:00-06:00
  // is active late Friday and early Saturday.
  if (days.has(weekday) && minute >= start) return true;
  const previousWeekday = (weekday + 6) % 7;
  return days.has(previousWeekday) && minute < end;
}

export function desiredScheduledState(
  policy: ScheduledServicePolicy,
  clock: LocalClock,
  activeInteractiveSessions = 0,
): ScheduledServiceState {
  if (!policy.enabled) return "stopped";
  if (policy.windows.length === 0) return "running";
  if (policy.windows.some((window) => isScheduleWindowActive(window, clock))) return "running";
  if (activeInteractiveSessions <= 0) return "stopped";

  switch (policy.closePolicy ?? "drain") {
    case "terminate-active":
      return "stopped";
    case "leave-active":
      return "running";
    case "drain":
      return "draining";
  }
}

function normalizedDays(days: number[] | undefined): Set<number> {
  if (!days) return new Set([0, 1, 2, 3, 4, 5, 6]);
  return new Set(days.filter(Number.isFinite).map(normalizeWeekday));
}

function normalizeWeekday(value: number): number {
  const integer = Math.trunc(Number.isFinite(value) ? value : 0);
  return ((integer % 7) + 7) % 7;
}

function normalizeMinute(value: number, allowEndOfDay = false): number {
  if (!Number.isFinite(value)) return 0;
  const integer = Math.trunc(value);
  if (allowEndOfDay && integer === 1440) return 0;
  return Math.min(1439, Math.max(0, integer));
}
