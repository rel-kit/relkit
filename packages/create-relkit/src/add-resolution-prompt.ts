import { Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { normalizeArtifactName } from "./add-name.js";

import { GeneratorPrompt } from "./generator-prompt.js";

import type { PromptOption } from "./prompt-driver.types.js";
import type { AddResolutionSnapshot } from "./add-resolution-state.types.js";

/**
 * Builds finite prompt capabilities against the private request Ref.
 * @param state - The invocation owner's private authoritative resolution Ref.
 * @param interactive - Whether omitted choices may request native input.
 * @returns Typed prompt Effects; headless calls resolve without asking questions.
 */
export function addResolutionPrompt(state: Ref.Ref<AddResolutionSnapshot>, interactive: boolean) {
  return {
    /**
     * Asks text through explicit prompt authority only for an interactive request.
     * @param message - Existing user-facing diagnostic.
     * @param initialValue - Initial driver answer used when the question first appears.
     * @param artifact - Whether entered text must pass artifact-name validation.
     * @returns Entered text, or undefined when the request is headless; invalid answers fail.
     */
    textEffect: Effect.fn("AddResolution.text")(
      (message: string, initialValue?: string, artifact = false) =>
        Effect.gen(function* () {
          if (!interactive) return undefined;
          yield* Ref.update(state, (state) => ({ ...state, prompted: true }));
          return yield* (yield* GeneratorPrompt).text({
            message,
            ...(initialValue === undefined ? {} : { initialValue }),
            validate: (value) => {
              if (!value?.trim()) return "A value is required.";
              if (!artifact) return undefined;
              try {
                normalizeArtifactName(value);
                return undefined;
              } catch (error) {
                return error instanceof Error ? error.message : String(error);
              }
            },
          });
        }),
      (effect) => observeExecution("generator", "add.resolve.text", effect),
    ),

    /**
     * Asks a finite choice through explicit prompt authority.
     * @typeParam Value - Union of declared prompt option values.
     * @param message - Question displayed by the prompt driver.
     * @param options - Finite choices offered to the user.
     * @param initialValue - Declared choice initially selected by the driver.
     * @returns An observed prompt Effect returning a declared value, or undefined when headless.
     */
    selectEffect: Effect.fn("AddResolution.select")(
      <Value extends string>(
        message: string,
        options: readonly PromptOption<Value>[],
        initialValue?: Value,
      ) =>
        Effect.gen(function* () {
          if (!interactive) return undefined;
          yield* Ref.update(state, (state) => ({ ...state, prompted: true }));
          return yield* (yield* GeneratorPrompt).select({
            message,
            options,
            ...(initialValue === undefined ? {} : { initialValue }),
          });
        }),
      (effect) => observeExecution("generator", "add.resolve.select", effect),
    ),

    /**
     * Asks multiple finite choices through explicit prompt authority.
     * @typeParam Value - Union of declared prompt option values.
     * @param message - Question displayed by the prompt driver.
     * @param options - Finite choices offered to the user.
     * @param required - Whether the selection must contain at least one value.
     * @returns An observed prompt Effect returning selected declared values, or undefined when headless.
     */
    multiselectEffect: Effect.fn("AddResolution.multiselect")(
      <Value extends string>(
        message: string,
        options: readonly PromptOption<Value>[],
        required = false,
      ) =>
        Effect.gen(function* () {
          if (!interactive) return undefined;
          yield* Ref.update(state, (state) => ({ ...state, prompted: true }));
          return yield* (yield* GeneratorPrompt).multiselect({ message, options, required });
        }),
      (effect) => observeExecution("generator", "add.resolve.multiselect", effect),
    ),

    /**
     * Asks consent through explicit prompt authority.
     * @param message - Existing user-facing diagnostic.
     * @param initialValue - Initial driver answer used when the question first appears.
     * @returns The consent answer, or undefined when the request is headless.
     */
    confirmEffect: Effect.fn("AddResolution.confirm")(
      (message: string, initialValue = true) =>
        Effect.gen(function* () {
          if (!interactive) return undefined;
          yield* Ref.update(state, (state) => ({ ...state, prompted: true }));
          return yield* (yield* GeneratorPrompt).confirm({ message, initialValue });
        }),
      (effect) => observeExecution("generator", "add.resolve.confirm", effect),
    ),
  };
}
