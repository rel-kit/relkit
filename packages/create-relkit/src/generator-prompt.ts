import { Context, Effect, Layer, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorPromptError, errorMessage } from "./generator-errors.js";
import type { GeneratorPromptService } from "./generator-prompt.types.js";
import type { PromptDriver } from "./prompt-driver.types.js";

/** Prompt authority; interactive workflows cannot run without an explicit live or test adapter. */
export class GeneratorPrompt extends Context.Service<GeneratorPrompt, GeneratorPromptService>()(
  "create-relkit/GeneratorPrompt",
) {}

/**
 * Adapts the existing public prompt driver to typed, interruptible operations.
 * @param driver - Clack or caller-owned deterministic prompt implementation.
 * @returns An interchangeable prompt Layer; answers are decoded at the adapter boundary.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { GeneratorPrompt, generatorPromptLayer, createClackPromptDriver } from "create-relkit";
 * const confirmed = GeneratorPrompt.use((prompt) => prompt.confirm({ message: "Continue?" }));
 * const run = confirmed.pipe(Effect.provide(generatorPromptLayer(createClackPromptDriver())));
 * ```
 */
export function generatorPromptLayer(driver: PromptDriver): Layer.Layer<GeneratorPrompt> {
  return Layer.effect(
    GeneratorPrompt,
    Effect.gen(function* () {
      return GeneratorPrompt.of({
        text: Effect.fn("GeneratorPrompt.text")((options) =>
          observed(
            "text",
            ask((signal) => driver.text(options, signal)).pipe(
              Effect.flatMap((answer) => Schema.decodeUnknownEffect(Schema.String)(answer)),
              Effect.mapError(promptError),
            ),
          ),
        ),
        select: Effect.fn("GeneratorPrompt.select")(
          <Value extends string>(
            options: import("./prompt-driver.types.js").ChoicePromptOptions<Value>,
          ) =>
            observed(
              "select",
              ask((signal) => driver.select(options, signal)).pipe(
                Effect.flatMap((answer) =>
                  Schema.decodeUnknownEffect(
                    Schema.Literals(options.options.map((option) => option.value)),
                  )(answer),
                ),
                Effect.mapError(promptError),
              ),
            ),
        ),
        multiselect: Effect.fn("GeneratorPrompt.multiselect")(
          <Value extends string>(
            options: import("./prompt-driver.types.js").ChoicePromptOptions<Value> & {
              readonly required?: boolean;
            },
          ) =>
            observed(
              "multiselect",
              ask((signal) => driver.multiselect(options, signal)).pipe(
                Effect.flatMap((answer) =>
                  Schema.decodeUnknownEffect(
                    Schema.Array(Schema.Literals(options.options.map((option) => option.value))),
                  )(answer),
                ),
                Effect.mapError(promptError),
              ),
            ),
        ),
        confirm: Effect.fn("GeneratorPrompt.confirm")((options) =>
          observed(
            "confirm",
            ask((signal) => driver.confirm(options, signal)).pipe(
              Effect.flatMap((answer) => Schema.decodeUnknownEffect(Schema.Boolean)(answer)),
              Effect.mapError(promptError),
            ),
          ),
        ),
      });
    }),
  );
}

/**
 * Adapts one prompt; questions and answers never become telemetry attributes.
 * @typeParam A - Decoded prompt answer type.
 * @param operation - Fixed bounded operation label.
 * @param effect - Decoded prompt operation to observe.
 * @returns The same prompt Effect with bounded outcome/duration observation.
 */
function observed<A>(
  operation: string,
  effect: Effect.Effect<A, GeneratorPromptError>,
): Effect.Effect<A, GeneratorPromptError> {
  return observeExecution("generator", `prompt.${operation}`, effect, () => ({ questions: 1 }));
}

/**
 * Adapts one Promise prompt at the explicit cancellation boundary.
 * @typeParam A - Native driver answer type.
 * @param run - Promise prompt adapter receiving the fiber's AbortSignal.
 * @returns A cancellable Effect returning the driver's answer or its typed prompt failure.
 */
function ask<A>(run: (signal: AbortSignal) => Promise<A>): Effect.Effect<A, GeneratorPromptError> {
  return Effect.tryPromise({ try: run, catch: promptError });
}

/**
 * Preserves prompt cancellation identity through its typed adapter.
 * @param cause - Original rejection retained for explicit diagnostics.
 * @returns The existing GeneratorPromptError or a new wrapper retaining the original rejection.
 */
function promptError(cause: unknown): GeneratorPromptError {
  return cause instanceof GeneratorPromptError
    ? cause
    : new GeneratorPromptError({ cause, message: errorMessage(cause) });
}
