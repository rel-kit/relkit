/**
 * Owns atomic creation from normalized options through installed preparation.
 * The creation Scope keeps its private sibling stage until a successful finite
 * check/snapshot operation; failure cleans that stage before the public adapter
 * returns. Published directories transfer to the user.
 */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import type { CreateOptions } from "./options.js";
import { validateCreateOptionsEffect } from "./validate.js";
import { GenerateProjectError, type GenerateProjectContext } from "./generate-types.js";
import { GeneratorPrompt } from "./generator-prompt.js";
import { domainError } from "./generator-errors.js";
import { acquireGenerationStage, publishGenerationStage } from "./generate-stage.js";
import {
  materializeGenerationStage,
  installGenerationStage,
  verifyGenerationStage,
} from "./generate-preparation.js";
import { generationResult } from "./generate-result.js";

/** Validates, prepares and publishes while a Scope owns the disposable stage.
 * @param options - Explicit options retaining existing defaults.
 * @param context - Caller-owned prompt, process, cancellation and progress settings.
 * @returns Lazy scoped workflow preserving existing public failures and output.
 */
export const generateEffect = Effect.fn("ProjectGeneration.execute")(
  (options: CreateOptions, context: GenerateProjectContext) =>
    Effect.scoped(
      Effect.gen(function* () {
        const validated = yield* validateCreateOptionsEffect(
          options,
          context.cwd === undefined ? {} : { cwd: context.cwd },
        );
        if (
          context.interactive === true &&
          !(yield* (yield* GeneratorPrompt).confirm({
            message: "Create this project?",
            initialValue: true,
          }))
        ) {
          return yield* Effect.fail(
            domainError(
              new GenerateProjectError("RELKIT_CREATE_CANCELLED", "Scaffolding was cancelled."),
            ),
          );
        }
        context.onProgress?.(`Creating a new RELKIT app in ${validated.destination}.`);
        const owned = yield* acquireGenerationStage(validated.destination, context);
        yield* materializeGenerationStage(owned.stage, options, context);
        const gitInitialized = yield* installGenerationStage(owned.stage, options, context);
        yield* verifyGenerationStage(owned.stage, options, context);
        yield* publishGenerationStage(owned, validated.destination, context);
        return yield* generationResult(options, validated.destination, gitInitialized, context);
      }),
    ),
  (effect) => observeExecution("generator", "generation.execute", effect),
);
