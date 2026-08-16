import { describe, expect, it } from "vitest";
import {
  desiredScheduledState,
  isScheduleWindowActive,
  type LocalClock,
  type ScheduledServicePolicy,
} from "./service-schedule.js";

const clock = (weekday: number, hour: number, minute = 0): LocalClock => ({
  weekday,
  minuteOfDay: hour * 60 + minute,
});

describe("isScheduleWindowActive", () => {
  it("supports ordinary weekday windows", () => {
    const workday = { days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 18 * 60 };
    expect(isScheduleWindowActive(workday, clock(1, 9))).toBe(true);
    expect(isScheduleWindowActive(workday, clock(5, 17, 59))).toBe(true);
    expect(isScheduleWindowActive(workday, clock(5, 18))).toBe(false);
    expect(isScheduleWindowActive(workday, clock(0, 12))).toBe(false);
  });

  it("treats an overnight window as belonging to its start day", () => {
    const overnight = { days: [5], startMinute: 22 * 60, endMinute: 6 * 60 };
    expect(isScheduleWindowActive(overnight, clock(5, 23))).toBe(true);
    expect(isScheduleWindowActive(overnight, clock(6, 2))).toBe(true);
    expect(isScheduleWindowActive(overnight, clock(6, 6))).toBe(false);
    expect(isScheduleWindowActive(overnight, clock(4, 23))).toBe(false);
  });

  it("supports all-day windows and disabled windows", () => {
    expect(
      isScheduleWindowActive({ days: [2], startMinute: 0, endMinute: 0 }, clock(2, 14)),
    ).toBe(true);
    expect(
      isScheduleWindowActive(
        { days: [2], startMinute: 0, endMinute: 0, enabled: false },
        clock(2, 14),
      ),
    ).toBe(false);
  });
});

describe("desiredScheduledState", () => {
  const scheduled: ScheduledServicePolicy = {
    enabled: true,
    closePolicy: "drain",
    windows: [{ days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 18 * 60 }],
  };

  it("runs enabled unscheduled services continuously", () => {
    expect(desiredScheduledState({ enabled: true, windows: [] }, clock(0, 3), 0)).toBe("running");
  });

  it("starts inside a schedule and stops outside it when idle", () => {
    expect(desiredScheduledState(scheduled, clock(1, 10), 0)).toBe("running");
    expect(desiredScheduledState(scheduled, clock(1, 20), 0)).toBe("stopped");
  });

  it("drains interactive work instead of killing it when the window closes", () => {
    expect(desiredScheduledState(scheduled, clock(1, 20), 2)).toBe("draining");
  });

  it("allows explicit terminate-active and leave-active policies", () => {
    expect(
      desiredScheduledState({ ...scheduled, closePolicy: "terminate-active" }, clock(1, 20), 2),
    ).toBe("stopped");
    expect(
      desiredScheduledState({ ...scheduled, closePolicy: "leave-active" }, clock(1, 20), 2),
    ).toBe("running");
  });

  it("never starts a disabled service even during its schedule", () => {
    expect(desiredScheduledState({ ...scheduled, enabled: false }, clock(1, 10), 0)).toBe("stopped");
  });
});
