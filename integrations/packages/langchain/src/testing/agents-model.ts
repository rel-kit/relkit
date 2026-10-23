/** Constructs deterministic native test models from scripted steps and exposes their observed calls for invocation assertions. */

import {
  modelScriptResetEffect,
  modelScriptTurnEffect,
  modelScriptReplaceEffect,
} from "./agents-model-operations.js";
import { ScriptedChatModel } from "./agents-model-native.js";
import { combineSignals } from "@relkit/testing/internal/runtime-clock";
import { Context, Effect, Layer, ManagedRuntime, Ref } from "effect";
import {
  observeExecution,
  runExecutionPromise,
  runExecutionSync,
} from "@relkit/contracts/operation";
import { disposeTestingOwner, testingLoggerLayer } from "@relkit/testing/internal/testing-owner";

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
      Effect.sync(() => makeModelScriptService(options)),
      (service) => service.reset,
    ),
  );
}

/** Constructs one isolated script service after its owning Layer is acquired.
 * @param options - Native model policy.
 * @returns Script operations sharing one state and reset authority.
 */
function makeModelScriptService(options: TestAgentModelOptions): ModelScriptService {
  const state = Ref.makeUnsafe<import("./agents-model.types.js").ModelScriptOwnedState>({
    turns: [],
    next: 0,
    calls: [],
    active: new Set(),
  });
  const reset = modelScriptResetEffect(state);
  return TestModelScript.of({
    turn: (request, signal) => modelScriptTurnEffect(state, options, request, signal),
    script: (turns) => modelScriptReplaceEffect(state, reset, turns),
    reset,
    calls: Effect.sync(() => Object.freeze(structuredClone(Ref.getUnsafe(state).calls))),
  });
}
