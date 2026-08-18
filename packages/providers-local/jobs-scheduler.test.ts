import { describe, expect, test } from "bun:test";
import { compileSchedule, createScheduler, ScheduleValidationError } from "./src/jobs/scheduler.ts";

describe("local scheduler", () => {
  test("validates static schedules and calculates timezone-aware next fires", () => {
    const compiled = compileSchedule(
      { id: "nightly", cron: "0 2 * * *", timezone: "UTC", input: { value: 1 }, overlap: "skip" },
      { currentDate: new Date("2026-08-14T00:00:00.000Z") },
    );

    expect(compiled.nextFireAt).toEqual(new Date("2026-08-14T02:00:00.000Z"));
    expect(compiled.nextFire(new Date("2026-08-14T02:00:00.000Z"))).toEqual(
      new Date("2026-08-15T02:00:00.000Z"),
    );
    expect(Object.isFrozen(compiled.input)).toBe(true);
    expect(() => compileSchedule({ ...compiled, cron: "61 * * * *" })).toThrow(
      ScheduleValidationError,
    );
    expect(() => compileSchedule({ ...compiled, timezone: "Not/AZone" })).toThrow(
      ScheduleValidationError,
    );
    expect(() => compileSchedule({ ...compiled, input: { bad: undefined } } as never)).toThrow(
      ScheduleValidationError,
    );
  });

  test("enqueues through the supplied job path and skips overlapping work", async () => {
    let now = new Date("2026-08-14T00:00:00.000Z");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const enqueued: unknown[] = [];
    const scheduler = createScheduler({ now: () => now });
    scheduler.register(
      { id: "minute", cron: "* * * * *", timezone: "UTC", input: { value: 1 }, overlap: "skip" },
      async (input, context) => {
        enqueued.push({ input, context });
        await gate;
        return "accepted";
      },
    );

    now = new Date("2026-08-14T00:01:00.000Z");
    const first = scheduler.tick();
    await Promise.resolve();
    now = new Date("2026-08-14T00:02:00.000Z");
    const second = await scheduler.tick();
    expect(second).toMatchObject([{ scheduleId: "minute", status: "skipped" }]);
    expect(enqueued).toHaveLength(1);
    release();
    await expect(first).resolves.toMatchObject([{ scheduleId: "minute", status: "enqueued" }]);
  });

  test("allows overlapping enqueue calls when configured", async () => {
    let now = new Date("2026-08-14T00:00:00.000Z");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const scheduler = createScheduler({ now: () => now });
    scheduler.register(
      { id: "minute", cron: "* * * * *", timezone: "UTC", input: null, overlap: "allow" },
      async () => {
        calls += 1;
        await gate;
      },
    );
    now = new Date("2026-08-14T00:01:00.000Z");
    const first = scheduler.tick();
    await Promise.resolve();
    now = new Date("2026-08-14T00:02:00.000Z");
    const second = scheduler.tick();
    await Promise.resolve();
    expect(calls).toBe(2);
    release();
    await Promise.all([first, second]);
  });
});
