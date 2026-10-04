import { createAgentState } from "./agent-state.js";

import { Context, Effect, Layer, ManagedRuntime } from "effect";
import {
  observeExecution,
  runExecutionPromise,
  runExecutionSync,
} from "@relkit/contracts/operation";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import { combineSignals } from "./runtime-clock.js";
import type { AgentHarnessService } from "./agent-harness.types.js";

import { createTestModel } from "./agents-model.js";
import type {
  TestAgent,
  TestAgentApproval,
  TestAgentDescriptor,
  TestAgentInvocationOptions,
  TestAgentOptions,
  TestAgentTrace,
} from "./agents-types.js";
import { assertAgentTrace } from "./agents-utils.js";

export type {
  TestAgent,
  TestAgentApproval,
  TestAgentApprovalMode,
  TestAgentApprovals,
  TestAgentDescriptor,
  TestAgentInvocationOptions,
  TestAgentModel,
  TestAgentModelCall,
  TestAgentModelOptions,
  TestAgentOptions,
  TestAgentTrace,
  TestAgentTraceExpectation,
  TestAgentTraceSnapshot,
  TestModelTurn,
} from "./agents-types.js";
export { assertAgentTrace } from "./agents-utils.js";
export { createTestModel } from "./agents-model.js";

/** Agent decisions, approval ownership and scripted invocation share one service. */
export class TestAgentHarness extends Context.Service<TestAgentHarness, AgentHarnessService>()(
  "relkit/testing/AgentHarness",
) {}

/**
 * Acquires the network-free harness behind the public synchronous factory.
 * @typeParam Agent Descriptor carrying input/output schema inference.
 * @param options Script, tool engine, approval and capture policies.
 * @returns A scoped service Layer; scope release resets outstanding work.
 */
export function testAgentLayer<Agent extends TestAgentDescriptor>(
  options: TestAgentOptions<Agent>,
) {
  return Layer.effect(
    TestAgentHarness,
    Effect.acquireRelease(
      Effect.gen(function* () {
        const { value, close } = yield* createAgentState(options);
        return TestAgentHarness.of({
          value,
          close: observeExecution("testing", "agent.close", close),
          invoke: (input, invocation) =>
            observeExecution(
              "testing",
              "agent.invoke",
              Effect.fn("Testing.agent.invoke")(() =>
                Effect.tryPromise({
                  try: async (signal) => {
                    const signals = combineSignals(invocation?.signal, signal);
                    try {
                      return await value.invoke(
                        input as import("@relkit/schema").InferInput<Agent["input"]>,
                        { ...invocation, signal: signals.signal },
                      );
                    } finally {
                      signals.dispose();
                    }
                  },
                  catch: (cause) => cause,
                }),
              )(),
            ),
        });
      }),
      (service) => service.close.pipe(Effect.orDie),
    ),
  );
}

/**
 * Creates isolated agent state with native model cancellation and owned approvals.
 * @typeParam Agent Descriptor determining public input/output types.
 * @param options Network-free script and native engine dependencies.
 * @returns A synchronously ready harness preserving existing results and errors.
 */
export function createTestAgent<Agent extends TestAgentDescriptor>(
  options: TestAgentOptions<Agent>,
): TestAgent<Agent> {
  const owner = ManagedRuntime.make(
    testAgentLayer(options).pipe(Layer.provideMerge(testingLoggerLayer(options.logger))),
  );
  let service;
  try {
    service = runExecutionSync(owner, TestAgentHarness);
  } catch (error) {
    void disposeTestingOwner(owner).catch(() => undefined);
    throw error;
  }
  let closing: Promise<void> | undefined;
  return Object.freeze({
    ...service.value,
    invoke: (
      input: import("@relkit/schema").InferInput<Agent["input"]>,
      options?: TestAgentInvocationOptions,
    ) => runExecutionPromise(owner, service.invoke(input, options)),
    close: () => (closing ??= disposeTestingOwner(owner)),
  }) as TestAgent<Agent>;
}
