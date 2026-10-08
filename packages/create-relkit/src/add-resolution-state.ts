import { Effect } from "effect";

import { generatorPromptLayer } from "./generator-prompt.js";
import { createClackPromptDriver } from "./prompt-driver.js";
import { runGeneratorPromise, runGeneratorSync } from "./generator-runtime.js";
import type { PromptOption } from "./prompt-driver.types.js";

import { AddResolutionStateBase } from "./add-resolution-state-base.js";

/** Finite request owner with existing synchronous and Promise compatibility methods. */
export class AddResolutionState extends AddResolutionStateBase {
  /**
   * Preserves the existing synchronous option API.
   * @param name - Authored name or declaration key.
   * @param value - Resolved flag value to append only when the flag is absent.
   * @returns Completion after the existing contract has been applied.
   */
  option(name: string, value: string): void {
    runGeneratorSync(this.optionEffect(name, value));
  }

  /**
   * Preserves the existing synchronous repeated-option API.
   * @param name - Authored name or declaration key.
   * @param values - Ordered declarations or argument values.
   * @returns Completion after the existing contract has been applied.
   */
  repeated(name: string, values: readonly string[]): void {
    runGeneratorSync(this.repeatedEffect(name, values));
  }

  /**
   * Preserves the existing synchronous flag API.
   * @param name - Authored name or declaration key.
   * @returns Completion after the existing contract has been applied.
   */
  flag(name: string): void {
    runGeneratorSync(this.flagEffect(name));
  }

  /**
   * Preserves the existing synchronous positional API.
   * @param value - Artifact name or route path to append only when absent.
   * @returns Completion after the existing contract has been applied.
   */
  positional(value: string): void {
    runGeneratorSync(this.positionalEffect(value));
  }

  /**
   * Preserves the text Prompt API.
   * @param message - Existing user-facing diagnostic.
   * @param initialValue - Initial native prompt answer or declared default.
   * @param artifact - Whether entered text must pass artifact-name validation.
   * @returns Decoded text; prompt interruption propagates to the native driver.
   */
  text(message: string, initialValue?: string, artifact = false): Promise<string | undefined> {
    return runGeneratorPromise(
      this.textEffect(message, initialValue, artifact).pipe(
        Effect.provide(generatorPromptLayer(this.prompt ?? createClackPromptDriver())),
      ),
    );
  }

  /**
   * Preserves the select Prompt API.
   * @typeParam Value - Union of declared prompt option values.
   * @param message - User-facing diagnostic or prompt text.
   * @param options - Declared choices offered by the prompt.
   * @param initialValue - Initial native prompt answer or declared default.
   * @returns One decoded declared option; invalid native answers fail.
   */
  select<Value extends string>(
    message: string,
    options: readonly PromptOption<Value>[],
    initialValue?: Value,
  ): Promise<Value | undefined> {
    return runGeneratorPromise(
      this.selectEffect(message, options, initialValue).pipe(
        Effect.provide(generatorPromptLayer(this.prompt ?? createClackPromptDriver())),
      ),
    );
  }

  /**
   * Preserves the multiselect Prompt API.
   * @typeParam Value - Union of declared prompt option values.
   * @param message - User-facing diagnostic or prompt text.
   * @param options - Declared choices offered by the prompt.
   * @param required - Whether at least one declared answer is required.
   * @returns Decoded declared options in driver order.
   */
  multiselect<Value extends string>(
    message: string,
    options: readonly PromptOption<Value>[],
    required = false,
  ): Promise<readonly Value[] | undefined> {
    return runGeneratorPromise(
      this.multiselectEffect(message, options, required).pipe(
        Effect.provide(generatorPromptLayer(this.prompt ?? createClackPromptDriver())),
      ),
    );
  }

  /**
   * Preserves the consent Prompt API.
   * @param message - Existing user-facing diagnostic.
   * @param initialValue - Initial native prompt answer or declared default.
   * @returns Decoded consent; cancellation retains its original rejection.
   */
  confirm(message: string, initialValue = true): Promise<boolean | undefined> {
    return runGeneratorPromise(
      this.confirmEffect(message, initialValue).pipe(
        Effect.provide(generatorPromptLayer(this.prompt ?? createClackPromptDriver())),
      ),
    );
  }
}

/**
 * Creates finite prompt choices without introducing effectful traversal.
 * @typeParam Value - Union of literal option values.
 * @param values - Ordered literal values offered by the prompt.
 * @returns Prompt choices with their literal values and human-readable labels.
 */
export function choices<const Value extends string>(
  values: readonly Value[],
): PromptOption<Value>[] {
  return values.map((value) => ({ value, label: label(value) }));
}

/**
 * Creates a human-readable label from a hyphenated identifier.
 * @param value - Hyphenated identifier to display.
 * @returns The identifier with spaces and an uppercase initial character.
 */
export function label(value: string): string {
  return value.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase());
}
