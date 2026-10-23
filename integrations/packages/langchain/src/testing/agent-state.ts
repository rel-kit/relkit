/** Builds an isolated native test facade whose work is joined before release. */
import { Effect, Ref } from "effect";
import { runOwnedContext } from "@relkit/testing/internal/work-ownership";
import type { TestAgent, TestAgentDescriptor, TestAgentOptions } from "./agents-types.js";
import { acquireAgentHarness } from "./agent-state-setup.js";
import { invokeAgentHarness } from "./agent-state-invocation.js";
import { agentHarnessClose, resetAgentHarness } from "./agent-state-lifecycle.js";

/** Creates a network-free test owner retaining descriptor schema inference.
 * @param options - Native dependencies, scripts and capture policy.
 * @returns The owned facade and cancellation-aware Effect release boundary.
 */
export function createAgentState<Agent extends TestAgentDescriptor>(
  options: TestAgentOptions<Agent>,
) {
  return Effect.gen(function* () {
    const context = yield* Effect.context<never>();
    const harness = yield* acquireAgentHarness(options);
    const { model, failures, approvals, trace, state } = harness;
    const invoke: TestAgent<Agent>["invoke"] = (input, invocation) => {
      const current = Ref.getUnsafe(state);
      if (current.closed) return Promise.reject(new Error("Test agent is closed"));
      const pending = invokeAgentHarness(options, harness, input, invocation);
      current.pending.add(pending);
      void pending.finally(() => current.pending.delete(pending)).catch(() => undefined);
      return pending;
    };
    const close = agentHarnessClose(context, harness);
    const value: TestAgent<Agent> = Object.freeze({
      model,
      failures,
      approvals,
      pending: approvals.pending,
      trace,
      script: model.script,
      invoke,
      close: () => runOwnedContext(context, close),
      reset: () => resetAgentHarness(harness),
    });
    return { value, close };
  });
}
