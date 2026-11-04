/**
 * Fault-injection tests for durable Postgres jobs: a worker that stops while
 * holding a lease, a crash after the handler succeeded but before the ack,
 * retries with dead-lettering, lease exhaustion, exclusive leasing under
 * concurrency, and pending work surviving a full instance replacement.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { RunHandle } from "relkit/contracts/jobs";
import { createPostgresJobsRuntime, type PostgresJobsRuntime } from "../src/runtime/index.js";
import { DEAD_LETTER_CODE } from "../src/runtime/jobs-rows.js";
import {
  contextFor,
  eventually,
  recordingExecutor,
  submission,
  threeAttempts,
} from "./jobs-fixtures.js";
import { acquirePostgres, postgresAvailable } from "./postgres-harness.js";

const postgres = postgresAvailable ? await acquirePostgres() : undefined;
afterAll(async () => postgres?.close());
const open: PostgresJobsRuntime[] = [];
afterEach(async () => void (await Promise.all(open.splice(0).map((runtime) => runtime.close()))));

function instance(service: string, leaseMs = 150): PostgresJobsRuntime {
  const runtime = createPostgresJobsRuntime({
    url: postgres!.url,
    service,
    leaseMs,
    pollIntervalMs: 20,
    maxConnections: 3,
  });
  open.push(runtime);
  return runtime;
}

describe.skipIf(postgres === undefined)("Postgres jobs under faults", () => {
  test("a worker that stops mid-run loses its lease and another worker retries", async () => {
    const [crashed, survivor] = [instance("crash-a"), instance("crash-a")];
    const context = contextFor("crash-a");
    const run = (await crashed.submit(
      submission(1, { policy: threeAttempts }),
      context,
    )) as RunHandle;
    expect(await crashed.worker.next(context)).toBeDefined();
    await crashed.close();
    expect(await survivor.processNext(recordingExecutor().executor)).toBe(false);
    const { executor, calls } = recordingExecutor();
    await eventually(() => survivor.processNext(executor));
    expect(calls[0]).toMatchObject({ runId: run.runId, attempt: 2 });
    expect(await survivor.get(run.runId, context)).toMatchObject({
      status: "completed",
      attempt: 2,
    });
  });

  test("a crash after handler success redelivers the run (at-least-once)", async () => {
    const [crashed, survivor] = [instance("crash-b"), instance("crash-b")];
    const context = contextFor("crash-b");
    const effects: string[] = [];
    const run = (await crashed.submit(
      submission("pay", { policy: threeAttempts }),
      context,
    )) as RunHandle;
    const work = await crashed.worker.next(context);
    effects.push(
      String(await recordingExecutor(() => "paid").executor.execute(work!.envelope, work!.binding)),
    );
    await crashed.close();
    await eventually(() =>
      survivor.processNext(
        recordingExecutor(() => {
          effects.push("paid");
          return "paid";
        }).executor,
      ),
    );
    expect(effects).toEqual(["paid", "paid"]);
    expect(await survivor.get(run.runId, context)).toMatchObject({ status: "completed" });
  });

  test("retryable failures retry under the policy, then dead-letter", async () => {
    const runtime = instance("dead-letter");
    const context = contextFor("dead-letter");
    const run = (await runtime.submit(
      submission(2, { policy: threeAttempts }),
      context,
    )) as RunHandle;
    const { executor, calls } = recordingExecutor(() => {
      throw { code: "SMTP_DOWN", message: "try later", retry: "later" };
    });
    await eventually(async () => {
      await runtime.processNext(executor);
      return (await runtime.get(run.runId, context)).status === "failed";
    });
    expect(calls.map((call) => call.attempt)).toEqual([1, 2, 3]);
    const failed = await runtime.get(run.runId, context);
    expect(failed).toMatchObject({
      attempt: 3,
      nativeDiagnosticCode: DEAD_LETTER_CODE,
      error: { code: "SMTP_DOWN" },
    });
    const page = await runtime.list({ status: ["failed"] }, context);
    expect(page.items.map((item) => item.runId)).toContain(run.runId);
    const retried = await runtime.retry!({ runId: run.runId, operationId: "replay-1" }, context);
    expect(retried).toMatchObject({ accepted: true, retryOfRunId: run.runId });
  });

  test("a failure that forbids retry ends the run after one attempt", async () => {
    const runtime = instance("no-retry");
    const context = contextFor("no-retry");
    const run = (await runtime.submit(
      submission(3, { policy: threeAttempts }),
      context,
    )) as RunHandle;
    await runtime.processNext(
      recordingExecutor(() => {
        throw { code: "BAD_INPUT", message: "never", retry: "never" };
      }).executor,
    );
    expect(await runtime.get(run.runId, context)).toMatchObject({ status: "failed", attempt: 1 });
  });

  test("an expired lease on the last permitted attempt ends failed", async () => {
    const [crashed, survivor] = [instance("exhausted"), instance("exhausted")];
    const context = contextFor("exhausted");
    const run = (await crashed.submit(submission(4), context)) as RunHandle;
    await crashed.worker.next(context);
    await crashed.close();
    await Bun.sleep(250);
    expect(await survivor.processNext(recordingExecutor().executor)).toBe(false);
    expect(await survivor.get(run.runId, context)).toMatchObject({
      status: "failed",
      error: { code: "RELKIT_JOB_LEASE_EXPIRED" },
    });
  });

  test("concurrent workers lease each run exactly once", async () => {
    const workers = [
      instance("parallel", 5_000),
      instance("parallel", 5_000),
      instance("parallel", 5_000),
    ];
    const context = contextFor("parallel");
    for (let index = 0; index < 30; index += 1)
      await workers[0]!.submit(submission(index), context);
    const { executor, calls } = recordingExecutor(async (envelope) => {
      await Bun.sleep(5);
      return envelope.runId;
    });
    for (const worker of workers) worker.startWorkers({ executor, concurrency: 2 });
    await eventually(async () => calls.length >= 30);
    await Bun.sleep(100);
    expect(new Set(calls.map((call) => call.runId)).size).toBe(30);
    expect(calls).toHaveLength(30);
  });

  test("pending runs survive replacing every instance", async () => {
    const before = instance("redeploy");
    const context = contextFor("redeploy");
    const runs = await Promise.all(
      [5, 6, 7].map((value) => before.submit(submission(value), context)),
    );
    await before.close();
    const after = instance("redeploy");
    const { executor, calls } = recordingExecutor();
    after.startWorkers({ executor });
    await eventually(async () => calls.length === 3);
    for (const run of runs)
      expect(await after.get((run as RunHandle).runId, context)).toMatchObject({
        status: "completed",
      });
  });
});
