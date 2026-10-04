import { ScriptedChatModel } from "./agents-model-native.js";
import { combineSignals } from "./runtime-clock.js";
import { Context, Effect, Layer, ManagedRuntime, Ref } from "effect";
import {
  observeExecution,
  runExecutionPromise,
  runExecutionSync,
} from "@relkit/contracts/operation";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";

import type { ModelScriptService, RuntimeTestAgentModel } from "./agents-model.types.js";

import type { TestAgentModelCall, TestAgentModelOptions, TestModelTurn } from "./agents-types.js";

/**
 * Creates an isolated scripted native language model without network access.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns A synchronous model facade owning script state and cancellation-aware turns.
 * @see tests/fixtures/checked-examples.ts ownedHelpersExample for checked script ownership.
 */
export function createTestModel(
  options: TestAgentModelOptions & { readonly script?: readonly TestModelTurn[] } = {},
): RuntimeTestAgentModel {
  const owner = ManagedRuntime.make(
    modelScriptLayer(options).pipe(Layer.provideMerge(testingLoggerLayer(options.logger))),
  );
  try {
    const service = runExecutionSync(owner, TestModelScript);
    const provider = options.provider ?? "test";
    const modelId = options.modelId ?? "default";
    const languageModel = new ScriptedChatModel(
      (request, signal) => runExecutionPromise(owner, service.turn(request, signal)),
      provider,
      modelId,
    );
    const script = (value: readonly TestModelTurn[]): void =>
      runExecutionSync(owner, service.script(value));
    const reset = (): void => runExecutionSync(owner, service.reset);
    let closing: Promise<void> | undefined;
    script(options.script ?? []);
    return Object.freeze({
      provider,
      modelId,
      languageModel,
      script,
      reset,
      close: () => (closing ??= disposeTestingOwner(owner)),
      get calls(): readonly TestAgentModelCall[] {
        return runExecutionSync(owner, service.calls);
      },
    });
  } catch (error) {
    void disposeTestingOwner(owner).catch(() => undefined);
    throw error;
  }
}

/** Stateful scripted turns and cancellation belong to one model owner. */
export class TestModelScript extends Context.Service<TestModelScript, ModelScriptService>()(
  "relkit/testing/ModelScript",
) {}

/**
 * Builds a network-free script service with cooperative native cancellation.
 * @param options Model policy and initial scripted turns.
 * @returns A synchronously ready replaceable service Layer.
 */
export function modelScriptLayer(options: TestAgentModelOptions = {}) {
  return Layer.effect(
    TestModelScript,
    Effect.acquireRelease(
      Effect.sync(() => {
        const state = Ref.makeUnsafe({
          turns: [] as readonly TestModelTurn[],
          next: 0,
          calls: [] as TestAgentModelCall[],
          active: new Set<AbortController>(),
        });
        const reset = observeExecution(
          "testing",
          "model.reset",
          Effect.sync(() => {
            const value = Ref.getUnsafe(state);
            for (const controller of value.active) controller.abort(new Error("Test model reset"));
            value.active.clear();
            value.next = 0;
            value.calls.length = 0;
          }),
        );
        return TestModelScript.of({
          turn: (request, signal) =>
            observeExecution(
              "testing",
              "model.turn",
              Effect.fn("Testing.model.turn")(() =>
                Effect.tryPromise({
                  try: async (fiberSignal) => {
                    const value = Ref.getUnsafe(state);
                    const controller = new AbortController();
                    value.active.add(controller);
                    const signals = combineSignals(signal, fiberSignal, controller.signal);
                    let abort: (() => void) | undefined;
                    try {
                      if (signals.signal.aborted)
                        throw signals.signal.reason ?? new Error("Test model cancelled");
                      if (options.hang === true)
                        return await new Promise<TestModelTurn>((_resolve, reject) => {
                          abort = () =>
                            reject(signals.signal.reason ?? new Error("Test model cancelled"));
                          signals.signal.addEventListener("abort", abort, { once: true });
                          if (signals.signal.aborted) abort();
                        });
                      const turn = value.turns[value.next++];
                      if (turn === undefined) throw new Error("Test model script exhausted");
                      const snapshot = structuredClone({ request, turn });
                      value.calls.push(
                        Object.freeze({
                          index: value.calls.length,
                          request: Object.freeze(snapshot.request),
                          turn: snapshot.turn,
                        }),
                      );
                      return structuredClone(turn);
                    } finally {
                      if (abort !== undefined) signals.signal.removeEventListener("abort", abort);
                      signals.dispose();
                      value.active.delete(controller);
                    }
                  },
                  catch: (cause) => cause,
                }),
              )(),
            ),
          script: (turns) =>
            observeExecution(
              "testing",
              "model.script",
              Effect.gen(function* () {
                if (!Array.isArray(turns))
                  return yield* Effect.fail(new TypeError("Test model script must be an array"));
                yield* reset;
                Ref.getUnsafe(state).turns = Object.freeze(structuredClone(turns));
              }),
            ),
          reset,
          // Detached retained evidence is a pure projection, not a second model operation.
          calls: Effect.sync(() => Object.freeze(structuredClone(Ref.getUnsafe(state).calls))),
        });
      }),
      (service) => service.reset,
    ),
  );
}
