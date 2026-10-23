/**
 * Applies scripted native turns under the test model owner's cancellation state.
 * Reset, replacement and detached evidence retain their existing ordering.
 */
import { Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { combineSignals } from "@relkit/testing/internal/runtime-clock";
import type { ModelScriptOwnedState } from "./agents-model.types.js";
import type { TestAgentModelCall, TestAgentModelOptions, TestModelTurn } from "./agents-types.js";

/** Cancels active requests and clears this model's script position/evidence.
 * @param state - This model's state.
 * @returns An observed reset Effect.
 */
export function modelScriptResetEffect(state: Ref.Ref<ModelScriptOwnedState>) {
  return observeExecution(
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
}

/** Replaces scripted decisions after resetting active work.
 * @param state - Owner state.
 * @param reset - Existing model reset operation.
 * @param turns - Detached replacement turns.
 * @returns The existing checked script replacement Effect.
 */
export function modelScriptReplaceEffect(
  state: Ref.Ref<ModelScriptOwnedState>,
  reset: Effect.Effect<void>,
  turns: readonly TestModelTurn[],
) {
  return observeExecution(
    "testing",
    "model.script",
    Effect.gen(function* () {
      if (!Array.isArray(turns))
        return yield* Effect.fail(new TypeError("Test model script must be an array"));
      yield* reset;
      Ref.getUnsafe(state).turns = Object.freeze(structuredClone(turns));
    }),
  );
}

/** Executes a turn through the original observed native cancellation boundary.
 * @param state - Owner state.
 * @param options - Native test model policy.
 * @param request - Detached request evidence.
 * @param signal - Optional caller cancellation.
 * @returns The scripted decision or original failure.
 */
export function modelScriptTurnEffect(
  state: Ref.Ref<ModelScriptOwnedState>,
  options: TestAgentModelOptions,
  request: TestAgentModelCall["request"],
  signal?: AbortSignal,
) {
  return observeExecution(
    "testing",
    "model.turn",
    Effect.fn("Testing.model.turn")(() =>
      Effect.tryPromise({
        try: (fiberSignal) => runModelScriptTurn(state, options, request, signal, fiberSignal),
        catch: (cause) => cause,
      }),
    )(),
  );
}

/** Settles one native turn and removes only listeners/controllers it acquired.
 * @param state - Owner state.
 * @param options - Hanging/script policy.
 * @param request - Request evidence.
 * @param signal - Optional caller signal.
 * @param fiberSignal - Owning Effect cancellation.
 * @returns Detached scripted turn after cancellation-aware work.
 */
async function runModelScriptTurn(
  state: Ref.Ref<ModelScriptOwnedState>,
  options: TestAgentModelOptions,
  request: TestAgentModelCall["request"],
  signal: AbortSignal | undefined,
  fiberSignal: AbortSignal,
): Promise<TestModelTurn> {
  const value = Ref.getUnsafe(state);
  const controller = new AbortController();
  value.active.add(controller);
  const signals = combineSignals(signal, fiberSignal, controller.signal);
  let abort: (() => void) | undefined;
  try {
    if (signals.signal.aborted) throw signals.signal.reason ?? new Error("Test model cancelled");
    if (options.hang === true)
      return await new Promise<TestModelTurn>((_resolve, reject) => {
        abort = () => reject(signals.signal.reason ?? new Error("Test model cancelled"));
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
}
