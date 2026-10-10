/**
 * Builds immutable creation output after atomic publication. The final directory
 * is listed after rename; skipped installation reports the finite preparation
 * workflow required before the first prepared development launch.
 */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import type { CreateOptions } from "./options.js";
import type { GenerateProjectContext } from "./generate-types.js";
import { listProjectFilesEffect } from "./generate-files.js";
import { createGenerateNextSteps } from "./generate-output.js";

/** Produces the published project's stable output contract.
 * @param options - Normalized creation choices.
 * @param destination - Atomically published final directory.
 * @param gitInitialized - Existing optional Git step result.
 * @param context - Working directory for printed local commands.
 * @returns Frozen output; listing failures retain their original channel.
 */
export const generationResult = Effect.fn("ProjectGeneration.result")(
  function* (
    options: CreateOptions,
    destination: string,
    gitInitialized: boolean,
    context: GenerateProjectContext,
  ) {
    return Object.freeze({
      ok: true as const,
      command: "create" as const,
      name: options.name,
      template: options.template,
      cloud: options.cloud,
      deploy: options.deploy,
      destination,
      files: Object.freeze(yield* listProjectFilesEffect(destination)),
      installed: options.install,
      gitInitialized,
      additions: Object.freeze([]),
      warnings: Object.freeze(
        !options.install
          ? [
              {
                code: "validation-skipped",
                message:
                  "Install dependencies, then run bunx --no-install relkit dev --prepare before bun dev. Preparation includes the source check.",
              },
            ]
          : [],
      ),
      nextSteps: createGenerateNextSteps(options, destination, context.cwd),
    });
  },
  (effect) => observeExecution("generator", "generation.result", effect),
);
