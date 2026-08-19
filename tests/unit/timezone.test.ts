// The date helpers round-trip through the process' local timezone
// (`toZonedTime` + local getters + `fromZonedTime`). Pin the process to a zone
// that observes DST so a regression there cannot hide behind a UTC server.
process.env.TZ = "America/New_York";
process.env.APP_TIMEZONE = "America/Bogota";

import { describe, expect, it } from "vitest";
import { rangeForIsoWeek, startOfMonthUtc, startOfWeekUtc, isoWeekId } from "@/lib/dates";

// 2026-03-08 is the US DST switch; Bogotá (UTC-5) never shifts.
const tuesdayAfterDstSwitch = new Date("2026-03-10T12:00:00.000Z");

describe("date windows under a DST host timezone", () => {
  it("starts the week on Monday 00:00 in APP_TIMEZONE", () => {
    expect(startOfWeekUtc(tuesdayAfterDstSwitch).toISOString()).toBe(
      "2026-03-09T05:00:00.000Z"
    );
  });

  it("starts the month on the 1st 00:00 in APP_TIMEZONE", () => {
    expect(startOfMonthUtc(tuesdayAfterDstSwitch).toISOString()).toBe(
      "2026-03-01T05:00:00.000Z"
    );
  });

  it("spans exactly seven days for an ISO week", () => {
    const week = isoWeekId(tuesdayAfterDstSwitch);
    const range = rangeForIsoWeek(week);
    expect(range).not.toBeNull();
    expect(range?.start.toISOString()).toBe("2026-03-09T05:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-03-16T05:00:00.000Z");
    const days = (range!.end.getTime() - range!.start.getTime()) / 86_400_000;
    expect(days).toBe(7);
  });

  it("keeps a November week whole across the autumn switch", () => {
    // 2026-11-01 is the US fall-back date.
    const range = rangeForIsoWeek("2026-W45");
    const days = (range!.end.getTime() - range!.start.getTime()) / 86_400_000;
    expect(days).toBe(7);
  });
});
