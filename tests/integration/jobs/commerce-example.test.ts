import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createInspectableObservabilityHooks,
  type InvocationContext,
  type InvocationHooks,
  type InvocationTarget,
  type PublicLogger,
} from "../../../packages/engine/src/index.ts";
import {
  createRegistrationPlan,
  type ApplicationGraph,
} from "../../../packages/graph/src/index.ts";
import { createScheduler } from "../../../packages/providers-local/src/index.ts";
import { createTestFakes, createTestJob } from "../../../packages/testing/src/index.ts";
import sendReceiptJob from "../../../examples/commerce/src/jobs/send-receipt.job.ts";
import sendReceipt from "../../../examples/commerce/src/functions/send-receipt.function.ts";
import { bindDescriptorIdentity } from "../../../packages/invocation/dist/index.js";
import { compileProject } from "../../compiler/fixture-runner.ts";

const APP_ROOT = resolve(import.meta.dir, "../../../examples/commerce");
type ReceiptInput = { readonly orderId: string; readonly receiptKey: string };
type ReceiptOutput = { readonly receiptId: string };
type ReceiptTarget = InvocationTarget<ReceiptInput, ReceiptOutput>;

bindDescriptorIdentity(sendReceipt, "send-receipt");

describe("commerce receipt jobs", () => {
  test("projects the receipt queue, schedule, and target edges", async () => {
    const compiled = await compileProject("commerce-example", APP_ROOT);
    const graph = JSON.parse(compiled.graphBytes) as ApplicationGraph;
    const plan = createRegistrationPlan(graph, { projectRoot: "/fixture" });
    const job = graph.nodes.find((node) => node.kind === "job" && node.id === "receipts.send-job");

    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        code: "RELKIT_EVENT_WILDCARD_RESTRICTED",
        severity: "warning",
        message: "Raw all-event selector is restricted to telemetry.",
      }),
    ]);
    expect(job).toMatchObject({
      kind: "job",
      targetFunctionId: "send-receipt",
      schedule: [
        {
          id: "receipts.reconcile",
          cron: "0 * * * *",
          timezone: "UTC",
          input: { orderId: "scheduled", receiptKey: "scheduled.json" },
          overlap: "skip",
        },
      ],
    });
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        {
          kind: "targets-function",
          from: "receipts.send-job",
          to: "send-receipt",
          role: "primary",
        },
        { kind: "enqueues-job", from: "orders.create-order", to: "receipts.send-job" },
        {
          kind: "enqueues-job",
          from: "relkit.event.receipts.on-order-created.handler",
          to: "receipts.send-job",
        },
      ]),
    );
    expect(plan.queues).toEqual([
      expect.objectContaining({ id: "receipts.send-job", targetFunctionId: "send-receipt" }),
    ]);
    expect(plan.schedules).toEqual([
      expect.objectContaining({
        id: "receipts.send-job:receipts.reconcile",
        jobId: "receipts.send-job",
        schedule: expect.objectContaining({ id: "receipts.reconcile" }),
      }),
    ]);
  });

  test("runs the scheduled receipt through the job engine and keeps query state after restart", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "relkit-commerce-jobs-"));
    let job: Awaited<ReturnType<typeof createTestJob>> | undefined;
    const logs: Array<{
      readonly message: string;
      readonly fields?: Readonly<Record<string, unknown>>;
    }> = [];
    const observability = createInspectableObservabilityHooks();
    const log: PublicLogger = {
      trace: (message, fields) =>
        logs.push({ message, ...(fields === undefined ? {} : { fields }) }),
      debug: (message, fields) =>
        logs.push({ message, ...(fields === undefined ? {} : { fields }) }),
      info: (message, fields) =>
        logs.push({ message, ...(fields === undefined ? {} : { fields }) }),
      warn: (message, fields) =>
        logs.push({ message, ...(fields === undefined ? {} : { fields }) }),
      error: (message, fields) =>
        logs.push({ message, ...(fields === undefined ? {} : { fields }) }),
    };
    const hooks: InvocationHooks["context"] = ({ invocation, signal, env, time }) => ({
      invocation,
      signal,
      env,
      time,
      log,
      functions: {},
      jobs: {},
      events: {},
      buckets: {},
      cache: {},
      agents: {},
    });
    const fakes = createTestFakes(stateRoot, {
      clock: () => job?.clock.currentTimeMs() ?? 0,
    });
    fakes.createBucket("assets");

    try {
      job = await createTestJob({
        jobId: sendReceiptJob.id,
        target: sendReceipt as unknown as ReceiptTarget,
        retry: sendReceiptJob.retry,
        idempotency: sendReceiptJob.idempotency,
        stateRoot,
        clients: fakes.clients,
        hooks: { observability, context: hooks },
      });
      const schedule = sendReceiptJob.schedule?.[0];
      if (schedule === undefined) throw new Error("Commerce receipt schedule is missing");
      const start = Date.UTC(2026, 7, 14, 0, 0);
      const fireAt = start + 60 * 60 * 1_000;
      const scheduler = createScheduler({ now: () => start });
      scheduler.register(schedule, (input, context) =>
        job!.enqueue(input as ReceiptInput, { acceptedAt: context.fireAt.getTime() }),
      );

      await expect(scheduler.tick(fireAt)).resolves.toMatchObject([
        { scheduleId: "receipts.reconcile", status: "enqueued" },
      ]);
      expect(job.admin.query()).toMatchObject({
        protocol: "relkit.jobs.admin",
        version: 1,
        counts: { available: 1, completed: 0 },
        items: [{ state: "available", profile: "default", attempt: 0 }],
      });
      expect(job.admin.query().items[0]).not.toHaveProperty("input");

      const completed = (await job.drain())[0];
      if (completed === undefined) throw new Error("Scheduled receipt did not run");
      expect(completed).toMatchObject({
        state: "completed",
        value: { receiptId: "scheduled:scheduled.json" },
        entry: { state: "completed", attempt: 1 },
      });
      expect(new TextDecoder().decode(await fakes.buckets.assets.read("scheduled.json"))).toBe(
        '{"orderId":"scheduled"}',
      );
      expect(logs).toEqual([
        {
          message: "receipt.sent",
          fields: { orderId: "scheduled", receiptKey: "scheduled.json" },
        },
      ]);

      const events = observability.read();
      const eventTypes = events.map((event) => event.type);
      expect(eventTypes).toEqual(
        expect.arrayContaining([
          "invocation.started",
          "edge.declared",
          "edge.observed",
          "span.started",
          "span.completed",
          "invocation.completed",
          "invocation.released",
        ]),
      );
      expect(eventTypes.filter((type) => type === "span.started")).toHaveLength(2);
      expect(eventTypes.filter((type) => type === "span.completed")).toHaveLength(2);
      expect(events.find((event) => event.type === "invocation.completed")).toMatchObject({
        completion: {
          outcome: "success",
          record: { functionId: "send-receipt", source: "job", attempt: 1 },
        },
      });
      expect(events.find((event) => event.type === "span.started")).toMatchObject({
        record: { functionId: "send-receipt", source: "job" },
      });

      await job.restart();
      expect(job.admin.status(completed.instanceId)).toMatchObject({
        protocol: "relkit.jobs.admin",
        version: 1,
        state: "completed",
        attempt: 1,
      });
      expect(job.admin.query({ state: "completed" }).items).toHaveLength(1);
    } finally {
      await job?.close();
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
