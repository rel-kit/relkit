/** Runs native invocations under the harness-owned span and cancellation lifetime. */
import { Ref } from "effect";
import { completeSpan, runInExecutionContext, startRootSpan } from "@relkit/invocation";
import { combineSignals } from "@relkit/testing/internal/runtime-clock";
import { invokeAgent } from "../index.js";
import type { AgentHarnessDependencies } from "./agent-harness.types.js";
import type {
  TestAgentDescriptor,
  TestAgentInvocationOptions,
  TestAgentOptions,
} from "./agents-types.js";

export async function invokeAgentHarness<Agent extends TestAgentDescriptor>(
  options: TestAgentOptions<Agent>,
  harness: AgentHarnessDependencies,

  input: import("@relkit/schema").InferInput<Agent["input"]>,
  invocation: TestAgentInvocationOptions = {},
): Promise<import("@relkit/schema").InferOutput<Agent["output"]>> {
  const { state, approvals, spanRuntime, model, engine, hooks } = harness;
  const approval = approvals.handler;
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
        ...(options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes }),
        ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
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
}
