/**
 * Schedules on the Postgres backend: two instances ticking the same schedule
 * enqueue exactly one run per occurrence, a stale contender loses on the
 * occurrence key, a redeploy with unchanged timing keeps the pending
 * occurrence, and the pure occurrence arithmetic honors cron timezones and
 * the misfire policies.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createPostgresJobsRuntime, type PostgresJobsRuntime } from "../src/runtime/index.js";
import { claimOccurrence } from "../src/runtime/schedules-tick.js";
import { dueOccurrences, nextOccurrence } from "../src/runtime/schedule-time.js";
import type { ScheduleRow } from "../src/runtime/schedules.types.js";
import { contextFor } from "./jobs-fixtures.js";
import { acquirePostgres, postgresAvailable } from "./postgres-harness.js";

const postgres = postgresAvailable ? await acquirePostgres() : undefined;
afterAll(async () => postgres?.close());
const open: PostgresJobsRuntime[] = [];
afterEach(async () => void (await Promise.all(open.splice(0).map((runtime) => runtime.close()))));

const definition = {
  jobId: "jobs.digest",
  taskId: "tasks.digest",
  taskVersion: "1",
  buildId: "build.test",
};

function instance(service: string, workerId: string): PostgresJobsRuntime {
  const runtime = createPostgresJobsRuntime({
    url: postgres!.url,
    service,
    workerId,
    maxConnections: 3,
  });
  open.push(runtime);
  runtime.registerWorker({
    definitions: [definition],
    executor: { execute: async () => null },
    startWorker: false,
  });
  return runtime;
}

function schedule(id: string, timing: Record<string, string | number>) {
  return { id, input: { digest: id }, ...timing, metadata: { jobId: definition.jobId } };
}

describe.skipIf(postgres === undefined)("Postgres schedules", () => {
  test("two instances enqueue exactly one run per occurrence", async () => {
    const [first, second] = [instance("two", "instance-a"), instance("two", "instance-b")];
    const context = contextFor("two");
    await first.schedules.upsert(schedule("every-100ms", { every: 100 }), context);
    await second.schedules.upsert(schedule("every-100ms", { every: 100 }), context);
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline)
      await Promise.all([first.tickSchedules(), second.tickSchedules(), first.tickSchedules()]);
    const occurrences = await postgres!.query(
      `select occurrence_at, run_id, claimed_by from relkit_schedule_occurrences where service = 'two'`,
    );
    const runs = await postgres!.query(
      `select request->>'occurrenceIdentity' as occurrence, count(*)::int as runs
       from relkit_job_runs where service = 'two' group by 1`,
    );
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
    expect(runs).toHaveLength(occurrences.length);
    expect(runs.every((row) => row.runs === 1)).toBe(true);
    expect(new Set(occurrences.map((row) => row.claimed_by)).size).toBeGreaterThanOrEqual(1);
  }, 30_000);

  test("a stale contender loses the occurrence key", async () => {
    const [first, second] = [instance("stale", "instance-a"), instance("stale", "instance-b")];
    await first.schedules.upsert(schedule("hourly", { every: "1 hour" }), contextFor("stale"));
    const [row] = (await postgres!.query(
      `select * from relkit_schedules where service = 'stale'`,
    )) as readonly ScheduleRow[];
    const at = "2026-11-05T10:00:00.000Z";
    const tables = first.database.tables;
    const claims = await Promise.all([
      first.database.run(claimOccurrence(tables, row!, at, "instance-a")),
      second.database.run(claimOccurrence(tables, row!, at, "instance-b")),
    ]);
    expect(claims.filter((claim) => claim !== undefined)).toHaveLength(1);
    const runs = await postgres!.query(
      `select run_id from relkit_job_runs where service = 'stale'`,
    );
    expect(runs).toHaveLength(1);
  });

  test("redeploying an unchanged schedule keeps its pending occurrence", async () => {
    const before = instance("redeploy", "instance-a");
    const context = contextFor("redeploy");
    await before.schedules.upsert(
      schedule("daily", { cron: "0 6 * * *", timezone: "Europe/Paris" }),
      context,
    );
    const [first] = await postgres!.query(
      `select next_at::text as next from relkit_schedules where service = 'redeploy'`,
    );
    await before.close();
    const after = instance("redeploy", "instance-b");
    await after.schedules.upsert(
      schedule("daily", { cron: "0 6 * * *", timezone: "Europe/Paris" }),
      context,
    );
    const [second] = await postgres!.query(
      `select next_at::text as next from relkit_schedules where service = 'redeploy'`,
    );
    expect(second).toEqual(first!);
    const listed = await after.schedules.list({ jobId: definition.jobId }, context);
    expect(listed).toMatchObject({
      schedules: [{ id: "daily", metadata: { jobId: definition.jobId } }],
    });
  });
});

describe("schedule occurrence arithmetic", () => {
  test("cron occurrences follow the schedule's timezone", () => {
    const next = nextOccurrence(
      { cron: "0 6 * * *", timezone: "Europe/Paris" },
      new Date("2026-11-05T12:00:00Z"),
    );
    expect(next.toISOString()).toBe("2026-11-06T05:00:00.000Z");
  });

  test("misfire policies select which missed occurrences run", () => {
    const start = new Date("2026-11-05T00:00:00Z");
    const now = new Date("2026-11-05T00:04:30Z");
    const timing = { every: 60_000 };
    expect(dueOccurrences({ ...timing, misfire: "all" }, start, now).due).toHaveLength(5);
    expect(dueOccurrences({ ...timing, misfire: "latest" }, start, now).due).toEqual([
      new Date("2026-11-05T00:04:00Z"),
    ]);
    expect(dueOccurrences({ ...timing, misfire: "skip" }, start, now).due).toHaveLength(1);
    const afterDowntime = new Date("2026-11-05T00:25:00Z");
    expect(
      dueOccurrences({ every: "10 minutes", misfire: "skip" }, start, afterDowntime).due,
    ).toEqual([]);
    expect(dueOccurrences(timing, start, now).next.toISOString()).toBe("2026-11-05T00:05:00.000Z");
  });
});
