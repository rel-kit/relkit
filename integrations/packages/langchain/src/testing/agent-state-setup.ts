/** Acquires one native test model and its trace, approval and cancellation state. */
import { Effect, Ref } from "effect";
import { SpanRuntime, spanSnapshot } from "@relkit/invocation";
import { createIdSource, createFailures } from "@relkit/testing/internal/jobs-utils";
import { createAgentApprovalState } from "./agent-approvals.js";
import { createTestModel } from "./agents-model.js";
import { captureHooks, createTrace } from "./agents-utils.js";
import type { AgentOwnedState } from "./agent-harness.types.js";
import type { TestAgentOptions } from "./agents-types.js";

export const acquireAgentHarness = Effect.fn("Testing.agent.acquire")(function* (
  options: TestAgentOptions,
) {
  const failures = options.failures ?? createFailures();
  const model = yield* acquireTestModel(options);
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
  const spanRuntime = createSpanRuntime(spans);
  const engine = {
    invoke: async (request: Parameters<typeof options.engine.invoke>[0]) => {
      const result = await options.engine.invoke(request);
      failures.check("model.after-tool-call");
      return result;
    },
  } satisfies typeof options.engine;
  return { failures, model, state, approvals, trace, hooks, spanRuntime, engine };
});

function acquireTestModel(options: TestAgentOptions) {
  return Effect.acquireRelease(
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
}

function createSpanRuntime(spans: AgentOwnedState["spans"]) {
  return new SpanRuntime({
    ids: createIdSource(),
    observer: (event) => {
      if (event.span.name !== "relkit.testing.agent" && event.type !== "updated") {
        spans.push(spanSnapshot(event));
      }
    },
  });
}
