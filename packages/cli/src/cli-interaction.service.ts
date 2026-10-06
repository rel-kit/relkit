import { Context, Effect, Layer, Schema } from "effect";
import { cliTry, cliPromise } from "./cli-errors.js";
import { observeCli } from "./cli-runtime.js";
import type { ChoicePromptOptions, PromptDriver } from "create-relkit";
import type { CliInteractionOperations } from "./cli-interaction.types.js";

/** Interactive prompt authority, substitutable by deterministic drivers. */
export class CliInteraction extends Context.Service<CliInteraction, CliInteractionOperations>()(
  "relkit/cli/Interaction",
) {}

/**
 * Supplies finite Clack prompt adapters without opening a terminal during acquisition.
 * @returns A live/test-driver-compatible interaction Layer.
 * @remarks Drivers receive the native fiber signal; prompts retain Clack presentation.
 */
export const interactionLayer = Layer.succeed(
  CliInteraction,
  CliInteraction.of({
    select: Effect.fn("CliInteraction.select")(
      <Value extends string>(
        driver: PromptDriver,
        options: ChoicePromptOptions<Value>,
        signal?: AbortSignal,
      ) =>
        observeCli(
          "interaction.select",
          cliPromise("interaction.select", (fiberSignal) =>
            driver.select(
              options,
              signal === undefined ? fiberSignal : AbortSignal.any([signal, fiberSignal]),
            ),
          ).pipe(
            Effect.flatMap((value) =>
              cliTry("interaction.answer", () => {
                if (
                  !Schema.is(Schema.Literals(options.options.map((option) => option.value)))(value)
                )
                  throw new TypeError("Prompt returned an undeclared choice.");
                return value;
              }),
            ),
          ),
        ),
    ),
    confirm: Effect.fn("CliInteraction.confirm")((driver, options, signal) =>
      observeCli(
        "interaction.confirm",
        cliPromise("interaction.confirm", (fiberSignal) =>
          driver.confirm(
            options,
            signal === undefined ? fiberSignal : AbortSignal.any([signal, fiberSignal]),
          ),
        ).pipe(
          Effect.flatMap((value) =>
            cliTry("interaction.answer", () => {
              if (!Schema.is(Schema.Boolean)(value))
                throw new TypeError("Prompt returned a non-boolean confirmation.");
              return value;
            }),
          ),
        ),
      ),
    ),
  }),
);
