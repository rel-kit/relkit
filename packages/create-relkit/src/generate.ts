import { Context, Effect, Layer } from "effect";

import { observeExecution } from "@relkit/contracts/operation";

import type { CreateOptions } from "./options.js";

import { generationError, throwIfAborted } from "./generate-process.js";

import {
  GenerateProjectError,
  type GenerateProjectContext,
  type GenerateProjectResult,
} from "./generate-types.js";

import { GeneratorFileSystem } from "./generator-filesystem.js";

import { GeneratorProcess, generatorProcessLayer } from "./generator-process.js";

import { GeneratorPaths } from "./generator-paths.js";

import { GeneratorPrompt, generatorPromptLayer } from "./generator-prompt.js";

import { createClackPromptDriver } from "./prompt-driver.js";

import { transferCleanupFailures } from "./generator-cleanup.js";

import { stageCleanupFor } from "./generate-stage-cleanup.js";

import { runGeneratorPromise } from "./generator-runtime.js";

import type { ProjectGenerationService } from "./generate.service.types.js";

/** Owns one complete creation workflow, including consent and atomic publication. */
export class ProjectGeneration extends Context.Service<
  ProjectGeneration,
  ProjectGenerationService
>()("create-relkit/ProjectGeneration") {}

/**
 * Generation captures explicit filesystem, path, process and prompt authority at acquisition.
 * @returns A ProjectGeneration Layer requiring filesystem, paths, process and prompt services.
 */
export const projectGenerationLive = Layer.effect(
  ProjectGeneration,
  Effect.gen(function* () {
    const fs = yield* GeneratorFileSystem;
    const process = yield* GeneratorProcess;
    const paths = yield* GeneratorPaths;
    const prompt = yield* GeneratorPrompt;
    return ProjectGeneration.of({
      generate: Effect.fn("ProjectGeneration.generate")((options, context) =>
        observeExecution(
          "generator",
          "generation.generate",
          generateEffect(options, context).pipe(
            Effect.provideService(GeneratorFileSystem, fs),
            Effect.provideService(GeneratorProcess, process),
            Effect.provideService(GeneratorPaths, paths),
            Effect.provideService(GeneratorPrompt, prompt),
          ),
          () => ({ projects: 1 }),
        ),
      ),
    });
  }),
);

/**
 * Generates a project through explicitly acquired creation authority.
 * @param options - Normalized creation flags.
 * @param context - Existing template, progress and executable settings.
 * @returns A lazy scoped workflow that settles owned resources before its result.
 */
export const generateProjectEffect = Effect.fn("ProjectGeneration.create")(
  function* (options: CreateOptions, context: GenerateProjectContext = {}) {
    return yield* (yield* ProjectGeneration).generate(options, context);
  },
  (effect) => observeExecution("generator", "generation.create", effect),
);

/**
 * Preserves the public Promise API, flags, errors and generated result shape.
 * @param options - Normalized creation flags.
 * @param context - Existing runner, prompt and cancellation settings.
 * @returns The generated result after atomic publication and scoped cleanup.
 */
export async function generateProject(
  options: CreateOptions,
  context: GenerateProjectContext = {},
): Promise<GenerateProjectResult> {
  throwIfAborted(context.signal);
  let program = generateProjectEffect(options, context).pipe(
    Effect.provide(projectGenerationLive),
    Effect.provide(
      generatorPromptLayer(
        context.promptDriver ?? createClackPromptDriver("RELKIT_CREATE_CANCELLED"),
      ),
    ),
  );
  if (context.commandRunner !== undefined)
    program = program.pipe(Effect.provide(generatorProcessLayer(context.commandRunner)));
  try {
    return await runGeneratorPromise(program, context.signal);
  } catch (error) {
    const cause = context.signal?.aborted
      ? (context.signal.reason ??
        new GenerateProjectError("RELKIT_INTERRUPTED", "Generation was interrupted."))
      : error;
    const cleanup = stageCleanupFor(context.signal?.aborted ? context.signal : error);
    const failure = generationError(cause, "RELKIT_CREATE_FAILED", cleanup);
    throw transferCleanupFailures(context.signal, transferCleanupFailures(error, failure));
  }
}

import { generateEffect } from "./generate-workflow.js";
