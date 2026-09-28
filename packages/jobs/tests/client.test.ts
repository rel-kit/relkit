import { describe, expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import { z } from "@relkit/schema";
import { createSpanId, createTraceId } from "@relkit/contracts";
import {
  completeSpan,
  runInExecutionContext,
  SpanRuntime,
  startRootSpan,
} from "@relkit/invocation";
import {
  createJobClient,
  createJobClientEffect,
  JobClientFailure,
  JobInputValidationError,
  JobOperationCancelledError,
  type JobOperationContext,
  type JobProvider,
} from "../src/client.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
describe("job Promise client", () => {
  test("validates input, resolves a logical profile, and correlates bridge/hooks", async () => {
    const bridgeNames: string[] = [];
    const declared: unknown[] = [];
    const observed: unknown[] = [];
    let context!: JobOperationContext;
    const provider: JobProvider = {
      enqueue: async (input, options, current) => {
        context = current;
        expect(input).toEqual({ id: "order-1" });
        expect(options).toEqual({ correlationId: "request-1" });
        return { instanceId: "job-1", accepted: true };
      },
    };
    const client = createJobClient({
      ownerId: "orders.create",
      jobId: "orders.send",
      inputSchema: z.object({ id: z.string() }),
      profile: "archive",
      source: { archive: provider },
      correlationId: () => "request-1",
      bridge: {
        run: async (operation, options) => {
          bridgeNames.push(options?.name ?? "");
          expect(options?.kind).toBe("producer");
          return operation();
        },
      },
      onDeclaredEdge: (edge) => declared.push(edge),
      onObservedEdge: (edge) => observed.push(edge),
    });
    await expect(client.enqueue({ id: "order-1" })).resolves.toEqual({
      instanceId: "job-1",
      accepted: true,
      status: "accepted",
      profile: "archive",
      correlationId: "request-1",
    });
    expect(bridgeNames).toEqual(["relkit.job.orders.send.enqueue"]);
    expect(declared).toEqual([{ kind: "enqueues-job", from: "orders.create", to: "orders.send" }]);
    expect(observed).toEqual([
      { relationship: "enqueues-job", from: "orders.create", to: "orders.send" },
    ]);
    expect(context).toMatchObject({
      operation: "enqueue",
      profile: "archive",
      correlationId: "request-1",
    });
    expect(context.signal).toBeInstanceOf(AbortSignal);
  });
  test("captures propagation inside the producer span", async () => {
    let context!: JobOperationContext;
    const client = createJobClient({
      ownerId: "orders.create",
      jobId: "orders.send",
      source: {
        enqueue: async (_input, _options, current) => {
          context = current;
          return { instanceId: "job-1", accepted: true };
        },
      },
    });
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
    });
    const root = startRootSpan(runtime, "request", "server");
    await runInExecutionContext(
      { span: root, runtime, originRequestId: "request-1", invocationId: "invocation-1" },
      () => client.enqueue({ id: "order-1" }),
    );
    completeSpan(root);
    expect(context.propagation).toMatchObject({
      version: 2,
      originRequestId: "request-1",
      invocationId: "invocation-1",
      producer: { traceId: root.traceId },
    });
    expect(context.propagation?.producer.spanId).not.toBe(root.spanId);
  });
  test("rejects invalid input before provider work and propagates cancellation", async () => {
    let calls = 0;
    const controller = new AbortController();
    let started!: () => void;
    const provider: JobProvider = {
      enqueue: async (_input, _options, context) => {
        calls += 1;
        started();
        await new Promise<void>(() => undefined);
        return { instanceId: "never", accepted: true };
      },
    };
    const client = createJobClient({
      ownerId: "orders.create",
      jobId: "orders.send",
      inputSchema: z.object({ id: z.string() }),
      source: provider,
      signal: () => controller.signal,
    });
    await expect(client.enqueue({ id: 1 } as never)).rejects.toBeInstanceOf(
      JobInputValidationError,
    );
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    const execution = client.enqueue({ id: "order-1" });
    await begun;
    controller.abort();
    await expect(execution).rejects.toBeInstanceOf(JobOperationCancelledError);
    expect(calls).toBe(1);
  });
});
test("Effect client reports setup and enqueue failures through tagged results and telemetry", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const invalid = await Effect.runPromise(
    Effect.provide(
      Effect.result(createJobClientEffect({ ownerId: "owner", jobId: "send", source: {} })),
      layer,
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(JobClientFailure);
    expect(invalid.failure._tag).toBe("Jobs.ClientFailure");
  }
  const client = await Effect.runPromise(
    Effect.provide(
      createJobClientEffect({
        ownerId: "owner",
        jobId: "send",
        source: { enqueue: () => ({ instanceId: "one", accepted: true }) },
      }),
      layer,
    ),
  );
  await expect(
    Effect.runPromise(Effect.provide(client.enqueueEffect("value"), layer)),
  ).resolves.toMatchObject({
    instanceId: "one",
    accepted: true,
  });
  expect(seen).toEqual(["client.create", "client.create", "client.enqueue"]);
});
