import { createAgentApprovalState } from "./agent-approvals.js";
import { Deferred, Effect, Ref } from "effect";
import { joinOwnedWork, runOwnedContext } from "./work-ownership.js";

import { combineSignals } from "./runtime-clock.js";

import { invokeAgent } from "@relkit/agents";
import {
  completeSpan,
  runInExecutionContext,
  spanSnapshot,
  SpanRuntime,
  startRootSpan,
} from "@relkit/invocation";
import { createIdSource, createFailures } from "./jobs-utils.js";
import { createTestModel } from "./agents-model.js";
import type {
  TestAgent,
  TestAgentDescriptor,
  TestAgentInvocationOptions,
  TestAgentOptions,
} from "./agents-types.js";
import { captureHooks, createTrace } from "./agents-utils.js";
import type { AgentOwnedState } from "./agent-harness.types.js";

/**
 * Creates an isolated, network-free agent harness around the existing runtime seam.
 * @typeParam Agent - Descriptor carrying input and output schema inference.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns The native state facade, reset and cancellation-aware close boundary.
 */
export function createAgentState<Agent extends TestAgentDescriptor>(
  options: TestAgentOptions<Agent>,
) {
  return Effect.gen(function* () {
    const context = yield* Effect.context<never>();
    const failures = options.failures ?? createFailures();
    const model = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createTestModel({
          ...(options.model ?? {}),
          ...(options.logger === undefined || options.model?.logger !== undefined
            ? {}
            : { logger: options.logger }),
          ...(options.script === undefined ? {} : { script: options.script }),
        }),
      ),
      (model) => Effect.promise(() => model.close()),
    );
    const state = Ref.makeUnsafe<AgentOwnedState>({
      closed: false,
      invocationSequence: 0,
      spans: [],
      edges: [],
      active: new Set(),
      pending: new Set(),
    });
    const { spans, edges } = Ref.getUnsafe(state);
    const approvals = createAgentApprovalState(options.approval);
    const trace = createTrace(spans, edges);
    const hooks = captureHooks(options.hooks, edges);
    const spanRuntime = new SpanRuntime({
      ids: createIdSource(),
      observer: (event) => {
        if (event.span.name !== "relkit.testing.agent" && event.type !== "updated") {
          spans.push(spanSnapshot(event));
        }
      },
    });
    const engine = {
      invoke: async (request: Parameters<typeof options.engine.invoke>[0]) => {
        const result = await options.engine.invoke(request);
        failures.check("model.after-tool-call");
        return result;
      },
    } satisfies typeof options.engine;
    const approval = approvals.handler;
    /**
     * Executes one native agent invocation with reset and caller cancellation.
     * @param input Value checked by the agent input schema.
     * @param invocation Native invocation overrides retaining capture and identity.
     * @returns The schema-validated native agent output.
     */
    const invokeWork = async (
      input: import("@relkit/schema").InferInput<Agent["input"]>,
      invocation: TestAgentInvocationOptions = {},
    ): Promise<import("@relkit/schema").InferOutput<Agent["output"]>> => {
      const invocationId =
        invocation.invocationId ?? `test-agent-${++Ref.getUnsafe(state).invocationSequence}`;
      const controller = new AbortController();
      Ref.getUnsafe(state).active.add(controller);
      const signals = combineSignals(invocation.signal, controller.signal);
      approvals.registerSignal(invocationId, signals.signal);
      const root = startRootSpan(spanRuntime, "relkit.testing.agent", "internal");
      try {
        return (await runInExecutionContext({ span: root, runtime: spanRuntime }, () =>
          invokeAgent({
            agent: options.agent,
            tools: options.tools,
            engine,
            modelRegistry: {
              resolveModel: () => ({ id: model.modelId, model: model.languageModel }),
            },
            ...(options.maxInputBytes === undefined
              ? {}
              : { maxInputBytes: options.maxInputBytes }),
            ...(options.maxOutputBytes === undefined
              ? {}
              : { maxOutputBytes: options.maxOutputBytes }),
            ...(approval === undefined ? {} : { approval }),
            ...(options.capture === undefined ? {} : { capture: options.capture }),
            ...invocation,
            signal: signals.signal,
            input,
            invocationId,
            hooks,
          }),
        )) as import("@relkit/schema").InferOutput<Agent["output"]>;
      } finally {
        approvals.releaseSignal(invocationId);
        signals.dispose();
        Ref.getUnsafe(state).active.delete(controller);
        completeSpan(root);
      }
    };
    /**
     * Registers native completion before exposing the Promise to its caller.
     * @param input Value checked by the agent input schema.
     * @param invocation Native invocation overrides and caller cancellation.
     * @returns The original completion, joined before owner release.
     */
    const invoke: TestAgent<Agent>["invoke"] = (input, invocation) => {
      const current = Ref.getUnsafe(state);
      if (current.closed) return Promise.reject(new Error("Test agent is closed"));
      const pending = invokeWork(input, invocation);
      current.pending.add(pending);
      void pending.finally(() => current.pending.delete(pending)).catch(() => undefined);
      return pending;
    };
    /**
     * Stops admission and aborts native work before joining its actual completion.
     * @returns Completion after all native invocations settle and the model owner closes.
     */
    const close = Effect.uninterruptible(
      Effect.fn("Testing.agent.close")(function* () {
        const current = Ref.getUnsafe(state);
        if (current.closing !== undefined)
          return yield* Effect.tryPromise({
            try: () => current.closing!,
            catch: (cause) => cause,
          });
        const done = yield* Deferred.make<void, unknown>();
        current.closing = runOwnedContext(context, Deferred.await(done));
        void current.closing.catch(() => undefined);
        current.closed = true;
        return yield* Effect.gen(function* () {
          approvals.reset();
          yield* Effect.forEach(
            [...current.active],
            (controller) => Effect.sync(() => controller.abort(new Error("Test agent closed"))),
            { concurrency: 1, discard: true },
          );
          current.active.clear();
          yield* joinOwnedWork(current.pending);
          yield* Effect.tryPromise({ try: () => model.close(), catch: (cause) => cause });
        }).pipe(Effect.onExit((exit) => Deferred.done(done, exit)));
      })(),
    );
    const value: TestAgent<Agent> = Object.freeze({
      model,
      failures,
      approvals,
      pending: approvals.pending,
      trace,
      script: model.script,
      invoke,
      close: () => runOwnedContext(context, close),
      reset: () => {
        for (const controller of Ref.getUnsafe(state).active)
          controller.abort(new Error("Test agent reset"));
        Ref.getUnsafe(state).active.clear();
        model.reset();
        trace.clear();
        approvals.reset();

        Ref.getUnsafe(state).invocationSequence = 0;
      },
    });
    return { value, close };
  });
}
