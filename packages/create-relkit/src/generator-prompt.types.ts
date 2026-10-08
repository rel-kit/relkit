import type { Effect } from "effect";
import type { GeneratorPromptError } from "./generator-errors.js";
import type { ChoicePromptOptions, TextPromptOptions } from "./prompt-driver.types.js";

/** Explicit interactive input authority, shared by Clack and deterministic test drivers. */
export interface GeneratorPromptService {
  /**
   * Asks for text through the explicit, cancellation-aware native driver.
   * @param options - Explicit options retaining existing defaults.
   * @returns Decoded text; prompt interruption propagates to the native driver.
   */
  readonly text: (options: TextPromptOptions) => Effect.Effect<string, GeneratorPromptError>;
  /**
   * Asks for one declared option and decodes the native answer.
   * @typeParam Value - Union of declared prompt option values.
   * @param options - Question, declared choices and optional initial selection.
   * @returns One decoded declared option; invalid native answers fail.
   */
  readonly select: <Value extends string>(
    options: ChoicePromptOptions<Value>,
  ) => Effect.Effect<Value, GeneratorPromptError>;
  /**
   * Asks for declared options and decodes their ordered native answers.
   * @typeParam Value - Union of declared prompt option values.
   * @param options - Question, declared choices and optional required-selection policy.
   * @returns Decoded declared options in driver order.
   */
  readonly multiselect: <Value extends string>(
    options: ChoicePromptOptions<Value> & { readonly required?: boolean },
  ) => Effect.Effect<readonly Value[], GeneratorPromptError>;
  /**
   * Asks for boolean consent and decodes the native answer.
   * @param options - Explicit options retaining existing defaults.
   * @returns Decoded consent; cancellation retains its original rejection.
   */
  readonly confirm: (options: {
    readonly message: string;
    readonly initialValue?: boolean;
  }) => Effect.Effect<boolean, GeneratorPromptError>;
}
