import { describe, expect, test } from "bun:test";
import { Effect } from "../../../packages/testing/node_modules/effect/dist/index.js";
import { defineEnv } from "../../../packages/config/src/index.ts";
import {
  createConcurrencyAdmission,
  createFunctionRegistry,
  createInspectableObservabilityHooks,
  createInvocationCallStack,
  invokeFunction,
  InvocationValidationError,
  RecursionPolicyError,
  type InvocationCompletion,
  type InvocationContextOptions,
  type InvocationIdSource,
  type InvocationRecord,
  type InvocationTarget,
  type PublicLogger,
} from "../../../packages/engine/src/index.ts";
import {
  abortablePromise,
  createGenerationRuntime,
  type GenerationServiceDefinition,
  type RuntimeManifest,
} from "../../../packages/runtime-effect/src/index.ts";
import { createDeterministicClock } from "../../../packages/testing/src/runtime-clock.ts";
import { createTestRuntime } from "../../../packages/testing/src/index.ts";
import {
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  type ProtocolId,
} from "../../../packages/contracts/src/index.ts";
import { hashGraph, type ApplicationGraph } from "../../../packages/graph/src/index.ts";
import { z } from "../../../packages/schema/src/index.ts";

type Value = { readonly value: number };
type EngineContext = {
  readonly invocation: InvocationRecord;
  readonly signal: AbortSignal;
  readonly log: PublicLogger;
  readonly time: { readonly now: () => Date };
};

interface LogRecord {
  readonly level: string;
  readonly message: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

interface EngineCapture {
  readonly logs: LogRecord[];
  readonly completions: InvocationCompletion[];
  readonly releases: boolean[];
  readonly observability: ReturnType<typeof createInspectableObservabilityHooks>;
  readonly context: (options: InvocationContextOptions) => EngineContext;
}

const valueInput = z.object({ value: z.number() });
const valueOutput = z.object({ value: z.number() });
const emptyInput = z.object({});
const emptyOutput = z.object({ ok: z.literal(true) });

function ids(prefix = "engine"): InvocationIdSource {
  let sequence = 0;
  return {
    next: (kind) => `${prefix}-${kind}-${++sequence}` as ProtocolId,
  };
}

function capture(): EngineCapture {
  const logs: LogRecord[] = [];
  const completions: InvocationCompletion[] = [];
  const releases: boolean[] = [];
  const observability = createInspectableObservabilityHooks();
  const write = (level: string, message: string, fields?: Readonly<Record<string, unknown>>) => {
    logs.push({ level, message, ...(fields === undefined ? {} : { fields }) });
  };
  const log = Object.freeze({
    trace: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("trace", message, fields),
    debug: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("debug", message, fields),
    info: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("info", message, fields),
    warn: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("warn", message, fields),
    error: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("error", message, fields),
  });
  return {
    logs,
    completions,
    releases,
    observability,
    context: ({ invocation, signal, time }) => ({ invocation, signal, time, log }),
  };
}

function hooksFor(captureState: EngineCapture) {
  return {
    observability: captureState.observability,
    context: captureState.context,
    onCompletion: (event: InvocationCompletion) => captureState.completions.push(event),
    onRelease: (event: { readonly admitted: boolean }) =>
      captureState.releases.push(event.admitted),
  };
}

function eventTypes(captureState: EngineCapture): readonly string[] {
  return captureState.observability.read().map((event) => event.type);
}

function declaredError(id: string): Error {
  return Object.assign(new Error("Order unavailable"), {
    name: "DeclaredError",
    id,
    ref: { kind: "error", id },
    data: { reason: "sold out" },
    retry: "never" as const,
    http: { status: 409 },
  });
}

function functionDependency(target: InvocationTarget): {
  readonly ref: { kind: string; id: string };
} {
  return {
    ref: { kind: "function", id: target.id },
  };
}

describe("engine integration matrix", () => {
  test("covers success, input failure, output defect, declared error, and unknown error", async () => {
    const successCapture = capture();
    const success = await invokeFunction<Value, Value, EngineContext>(
      {
        id: "engine.success",
        input: valueInput,
        output: valueOutput,
        handler: (input, _request, context) => {
          context.log.info("success", { functionId: context.invocation.functionId });
          return { value: input.value + 1 };
        },
      },
      { value: 2 },
      { idSource: ids("success"), hooks: hooksFor(successCapture) },
    );
    expect(success).toEqual({ value: 3 });
    expect(successCapture.logs).toContainEqual({
      level: "info",
      message: "success",
      fields: { functionId: "engine.success" },
    });
    expect(successCapture.completions[0]?.outcome).toBe("success");
    expect(eventTypes(successCapture)).toEqual([
      "invocation.started",
      "span.started",
      "span.completed",
      "invocation.completed",
      "invocation.released",
    ]);

    const inputCapture = capture();
    let inputCalled = false;
    await expect(
      invokeFunction(
        {
          id: "engine.input-failure",
          input: valueInput,
          output: valueOutput,
          handler: () => {
            inputCalled = true;
            return { value: 1 };
          },
        },
        { value: "bad" },
        { idSource: ids("input"), hooks: hooksFor(inputCapture) },
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    expect(inputCalled).toBe(false);
    expect(inputCapture.completions[0]?.outcome).toBe("validation-error");
    expect(inputCapture.releases).toEqual([false]);
    expect(eventTypes(inputCapture)).not.toContain("span.started");

    const outputCapture = capture();
    const outputFailure = await invokeFunction(
      {
        id: "engine.output-defect",
        input: valueInput,
        output: valueOutput,
        handler: (_input: Value, _request, context: EngineContext) => {
          context.log.error("invalid output");
          return { value: "bad" } as unknown as Value;
        },
      },
      { value: 1 },
      { idSource: ids("output"), hooks: hooksFor(outputCapture) },
    ).catch((error) => error as { readonly kind: string; readonly code: string });
    expect(outputFailure).toMatchObject({ kind: "defect", code: "ZSYS_UNEXPECTED_DEFECT" });
    expect(outputCapture.completions[0]?.outcome).toBe("defect");
    expect(eventTypes(outputCapture)).toContain("span.completed");

    const declaredCapture = capture();
    const declaredFailure = await invokeFunction(
      {
        id: "engine.declared-error",
        input: valueInput,
        output: valueOutput,
        errors: [{ id: "orders.unavailable", data: z.object({ reason: z.string() }) }],
        handler: (_input: Value, _request, context: EngineContext) => {
          context.log.warn("declared failure");
          throw declaredError("orders.unavailable");
        },
      },
      { value: 1 },
      { idSource: ids("declared"), hooks: hooksFor(declaredCapture) },
    ).catch((error) => error as { readonly kind: string; readonly id: string });
    expect(declaredFailure).toMatchObject({ kind: "application", id: "orders.unavailable" });
    expect(declaredCapture.completions[0]?.outcome).toBe("declared-error");
    expect(declaredCapture.completions[0]?.publicError).toMatchObject({
      code: "orders.unavailable",
      status: 409,
    });

    const unknownCapture = capture();
    const unknownFailure = await invokeFunction(
      {
        id: "engine.unknown-error",
        input: valueInput,
        output: valueOutput,
        handler: (_input: Value, _request, context: EngineContext) => {
          context.log.error("unexpected failure");
          throw new Error("internal secret");
        },
      },
      { value: 1 },
      { idSource: ids("unknown"), hooks: hooksFor(unknownCapture) },
    ).catch((error) => error as { readonly kind: string; readonly message: string });
    expect(unknownFailure).toMatchObject({
      kind: "defect",
      message: "Unexpected internal error",
    });
    expect(unknownFailure.message).not.toContain("internal secret");
    expect(unknownCapture.completions[0]?.outcome).toBe("defect");
    expect(eventTypes(unknownCapture)).toContain("span.completed");
  });

  test("preserves parent/child metadata, trace propagation, logs, and spans", async () => {
    const state = capture();
    const child: InvocationTarget<Value, Value, EngineContext> = {
      id: "engine.child",
      input: valueInput,
      output: valueOutput,
      handler: (input, _request, context) => {
        context.log.info("child", { invocationId: context.invocation.id });
        return { value: input.value + 1 };
      },
    };
    const parent: InvocationTarget<Value, Value, EngineContext> = {
      id: "engine.parent",
      input: valueInput,
      output: valueOutput,
      dependencies: { functions: { child: functionDependency(child) } },
      handler: async (input, _request, context) => {
        context.log.info("parent", { invocationId: context.invocation.id });
        const functions = context as EngineContext & {
          readonly functions: Readonly<Record<string, (value: unknown) => Promise<unknown>>>;
        };
        return (await functions.functions.child(input)) as Value;
      },
    };

    await invokeFunction(
      parent,
      { value: 2 },
      {
        clients: { functions: { child } },
        correlationId: "request-1",
        idSource: ids("parent"),
        hooks: hooksFor(state),
      },
    );

    const records = state.completions.map(({ record }) => record);
    const root = records.find((record) => record.functionId === "engine.parent");
    const childRecord = records.find((record) => record.functionId === "engine.child");
    expect(root).toMatchObject({
      source: "direct",
      traceId: "parent-trace-1",
      correlationId: "request-1",
    });
    expect(childRecord).toMatchObject({
      source: "direct",
      parentId: root?.id,
      traceId: root?.traceId,
      correlationId: root?.correlationId,
    });
    expect(childRecord?.id).not.toBe(root?.id);

    const startedSpans = state.observability
      .read()
      .filter((event) => event.type === "span.started")
      .map((event) => event.record);
    expect(startedSpans).toHaveLength(2);
    const rootSpan = startedSpans.find((span) => span.functionId === "engine.parent");
    const childSpan = startedSpans.find((span) => span.functionId === "engine.child");
    expect(childSpan).toMatchObject({
      traceId: rootSpan?.traceId,
      parentSpanId: rootSpan?.spanId,
    });
    expect(state.logs.map(({ message }) => message)).toEqual(["parent", "child"]);
    expect(eventTypes(state)).toContain("edge.declared");
    expect(eventTypes(state)).toContain("edge.observed");
  });

  test("handles pre-start cancellation and cancellation while awaiting a provider", async () => {
    const preStart = new AbortController();
    preStart.abort(new Error("cancelled before start"));
    const preCapture = capture();
    let called = false;
    const preFailure = await invokeFunction(
      {
        id: "engine.cancel-before-start",
        input: emptyInput,
        output: emptyOutput,
        handler: () => {
          called = true;
          return { ok: true };
        },
      },
      {},
      { signal: preStart.signal, idSource: ids("pre-cancel"), hooks: hooksFor(preCapture) },
    ).catch((error) => error as { readonly kind: string });
    expect(preFailure.kind).toBe("cancellation");
    expect(called).toBe(false);
    expect(preCapture.completions[0]?.outcome).toBe("cancelled");
    expect(preCapture.releases).toEqual([false]);

    const during = new AbortController();
    let providerStartedResolve!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      providerStartedResolve = resolve;
    });
    let providerSignal: AbortSignal | undefined;
    let handlerSignal: AbortSignal | undefined;
    const providerCapture = capture();
    const providerTarget: InvocationTarget<unknown, unknown, EngineContext> = {
      id: "engine.cancel-provider",
      input: emptyInput,
      output: emptyOutput,
      dependencies: {
        cache: { prices: { ref: { kind: "cache", id: "prices" } } },
      },
      handler: (_input, _request, context) => {
        handlerSignal = context.signal;
        const cache = context as EngineContext & {
          readonly cache: {
            readonly prices: { readonly get: (key: unknown) => Promise<unknown> };
          };
        };
        return cache.cache.prices.get("order-1");
      },
    };
    const execution = invokeFunction(
      providerTarget,
      {},
      {
        clients: {
          cache: {
            prices: {
              get: () => {
                if (handlerSignal === undefined) throw new Error("handler has not started");
                return abortablePromise(handlerSignal, (signal) => {
                  providerSignal = signal;
                  providerStartedResolve();
                  return new Promise<never>(() => undefined);
                });
              },
            },
          },
        },
        signal: during.signal,
        idSource: ids("provider-cancel"),
        hooks: hooksFor(providerCapture),
      },
    );
    await providerStarted;
    during.abort(new Error("provider cancelled"));
    const providerFailure = await execution.catch((error) => error as { readonly kind: string });
    expect(providerFailure.kind).toBe("cancellation");
    expect(providerSignal?.aborted).toBe(true);
    expect(providerCapture.completions[0]?.outcome).toBe("cancelled");
    expect(eventTypes(providerCapture)).toContain("span.completed");
    expect(providerCapture.logs).toEqual([]);
  });

  test("classifies deterministic timeout and queues concurrency without counting waiters", async () => {
    const deterministic = createDeterministicClock(0);
    const timeoutCapture = capture();
    let timeoutStarted!: () => void;
    let timeoutAborted = false;
    const started = new Promise<void>((resolve) => {
      timeoutStarted = resolve;
    });
    const timeoutExecution = invokeFunction(
      {
        id: "engine.timeout",
        input: emptyInput,
        output: emptyOutput,
        handler: (_input: unknown, _request, context: EngineContext) => {
          context.log.info("waiting for deadline");
          timeoutStarted();
          return new Promise<never>((_resolve) => {
            context.signal.addEventListener("abort", () => {
              timeoutAborted = true;
            });
          });
        },
      },
      {},
      {
        timeoutMs: 100,
        now: deterministic.clock.currentTimeMs,
        effectRunner: { run: deterministic.run },
        idSource: ids("timeout"),
        hooks: hooksFor(timeoutCapture),
      },
    );
    const timeoutResult = timeoutExecution.catch((error) => error as { readonly kind: string });
    await Promise.resolve();
    await started;
    await deterministic.clock.advance(0);
    await deterministic.clock.advance(100);
    const timeoutFailure = await timeoutResult;
    expect(timeoutFailure.kind).toBe("timeout");
    expect(timeoutAborted).toBe(true);
    expect(timeoutCapture.completions[0]?.outcome).toBe("timeout");
    expect(eventTypes(timeoutCapture)).toContain("span.completed");

    const admission = createConcurrencyAdmission();
    const queueCapture = capture();
    const starts: number[] = [];
    let active = 0;
    let maximumActive = 0;
    let firstRelease!: () => void;
    let firstStarted!: () => void;
    let secondQueued!: () => void;
    const firstReady = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const queueReady = new Promise<void>((resolve) => {
      secondQueued = resolve;
    });
    let admissionCalls = 0;
    const queueTarget: InvocationTarget<Value, Value, EngineContext> = {
      id: "engine.queued",
      input: valueInput,
      output: valueOutput,
      concurrency: 1,
      handler: async (input, _request, context) => {
        starts.push(input.value);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        context.log.info("queued", { value: input.value });
        if (input.value === 1) {
          firstStarted();
          await new Promise<void>((resolve) => {
            firstRelease = resolve;
          });
        }
        active -= 1;
        return input;
      },
    };
    const admit = (request: Parameters<typeof admission.acquire>[0]) => {
      const result = admission.acquire(request);
      admissionCalls += 1;
      if (admissionCalls === 2) secondQueued();
      return result;
    };
    const first = invokeFunction(
      queueTarget,
      { value: 1 },
      {
        admit,
        idSource: ids("queue"),
        hooks: hooksFor(queueCapture),
      },
    );
    await firstReady;
    const second = invokeFunction(
      queueTarget,
      { value: 2 },
      {
        admit,
        idSource: ids("queue"),
        hooks: hooksFor(queueCapture),
      },
    );
    await queueReady;
    expect(starts).toEqual([1]);
    expect(admission.activeCount("engine.queued")).toBe(1);
    expect(admission.waitingCount("engine.queued")).toBe(1);
    firstRelease();
    await expect(first).resolves.toEqual({ value: 1 });
    await expect(second).resolves.toEqual({ value: 2 });
    expect(starts).toEqual([1, 2]);
    expect(maximumActive).toBe(1);
    expect(admission.activeCount("engine.queued")).toBe(0);
    expect(admission.waitingCount("engine.queued")).toBe(0);
    expect(queueCapture.completions.map(({ outcome }) => outcome)).toEqual(["success", "success"]);
    expect(queueCapture.logs).toHaveLength(2);
    expect(eventTypes(queueCapture).filter((type) => type === "span.completed")).toHaveLength(2);
  });

  test("interrupts shutdown work and rejects undeclared dependency access", async () => {
    const runtime = createTestRuntime({ startTimeMs: 10, closeTimeoutMs: 100 });
    const shutdownCapture = capture();
    let started!: () => void;
    let aborted = false;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = runtime.invoke(
      {
        id: "engine.shutdown",
        input: emptyInput,
        output: emptyOutput,
        handler: (_input: unknown, _request, context: EngineContext) => {
          started();
          return new Promise<never>((_resolve, reject) => {
            context.signal.addEventListener("abort", () => {
              aborted = true;
              reject(context.signal.reason);
            });
          });
        },
      },
      {},
      { hooks: hooksFor(shutdownCapture) },
    );
    await startedPromise;
    await runtime.close();
    const shutdownFailure = await pending.catch((error) => error as { readonly kind: string });
    expect(shutdownFailure.kind).toBe("cancellation");
    expect(aborted).toBe(true);
    expect(shutdownCapture.completions[0]?.outcome).toBe("cancelled");
    expect(eventTypes(shutdownCapture)).toContain("span.completed");

    const dependencyCapture = capture();
    const dependencyFailure = await invokeFunction(
      {
        id: "engine.undeclared",
        input: emptyInput,
        output: emptyOutput,
        handler: (_input: unknown, _request, context: EngineContext) => {
          context.log.info("checking dependency");
          const clients = context as EngineContext & {
            readonly cache: {
              readonly prices: { readonly get: (key: unknown) => Promise<unknown> };
            };
          };
          return clients.cache.prices.get("missing");
        },
      },
      {},
      { idSource: ids("undeclared"), hooks: hooksFor(dependencyCapture) },
    ).catch((error) => error as { readonly kind: string; readonly message: string });
    expect(dependencyFailure).toMatchObject({
      kind: "defect",
      message: "Unexpected internal error",
    });
    expect(dependencyCapture.completions[0]?.outcome).toBe("defect");
    expect(dependencyCapture.logs).toContainEqual({
      level: "info",
      message: "checking dependency",
    });
  });

  test("covers recursion policy and rejects a graph/manifest mismatch", () => {
    const stack = createInvocationCallStack().enter({
      functionId: "engine.recursive",
      invocationId: "invocation-1",
    });
    expect(() => stack.enter("engine.recursive", "invocation-2")).toThrow(RecursionPolicyError);
    try {
      stack.enter("engine.recursive");
    } catch (error) {
      expect(error).toMatchObject({
        code: "ZSYS_RECURSION_DENIED",
        callStack: ["engine.recursive"],
        cycle: ["engine.recursive", "engine.recursive"],
      });
    }

    const graph: ApplicationGraph = {
      contractVersion: GRAPH_VERSION,
      nodes: [],
      edges: [],
    };
    expect(() =>
      createFunctionRegistry(graph, {
        contractVersion: MANIFEST_VERSION,
        generatorVersion: GENERATOR_VERSION,
        graphHash: "sha256:mismatch",
        functions: {},
      }),
    ).toThrow("ZSYS_GRAPH_MANIFEST_MISMATCH");
    expect(hashGraph(graph)).not.toBe("sha256:mismatch");
    expect(CONTRACT_VERSION).toBe(GRAPH_VERSION);
  });

  test("releases generation providers in reverse order and cleans up construction failure", async () => {
    const graph: ApplicationGraph = { contractVersion: GRAPH_VERSION, nodes: [], edges: [] };
    const manifest: RuntimeManifest = {
      contractVersion: MANIFEST_VERSION,
      generatorVersion: GENERATOR_VERSION,
      graphHash: "sha256:engine-generation",
      functions: {},
      providers: {},
      middleware: {},
      requestTransforms: {},
    };
    const base = {
      environment: "test",
      env: defineEnv({}),
      source: {},
      graph,
      graphHash: manifest.graphHash,
      manifest,
    };
    const released: string[] = [];
    const service = (
      id: string,
      dependencies?: readonly string[],
    ): GenerationServiceDefinition => ({
      id,
      ...(dependencies === undefined ? {} : { dependencies }),
      acquire: () => Effect.succeed(id),
      release: () => Effect.sync(() => released.push(id)),
    });
    const generation = await createGenerationRuntime({
      ...base,
      services: [service("config"), service("provider", ["config"])],
    });
    await generation.dispose();
    expect(released).toEqual(["provider", "config"]);

    const failed: string[] = [];
    await expect(
      createGenerationRuntime({
        ...base,
        services: [
          {
            ...service("config"),
            release: () => Effect.sync(() => failed.push("config")),
          },
          {
            ...service("provider", ["config"]),
            acquire: () => Effect.fail(new Error("provider construction failed")),
          },
        ],
      }),
    ).rejects.toBeDefined();
    expect(failed).toEqual(["config"]);
  });
});
