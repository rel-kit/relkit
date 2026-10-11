/**
 * Materializes, installs and validates a private creation stage. Finite dev
 * --prepare owns one full check and reuses it for bundling; creation publishes
 * only after its complete snapshot is durable. No development listener or
 * support process is started here.
 */
import { join } from "node:path";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import type { CreateOptions } from "./options.js";
import type { GenerateProjectContext } from "./generate-types.js";
import { GeneratorProcess } from "./generator-process.js";
import { resolveTemplateRootEffect } from "./template-root.js";
import { prepareProjectDependencyPatchEffect } from "./dependency-patches.js";
import { domainTry } from "./generator-errors.js";
import {
  copyTemplateEffect,
  customizeProjectEffect,
  requireFilesEffect,
  requireTemplateEffect,
} from "./generate-files.js";
import {
  injectGenerateFailure,
  resolveRelkitExecutableEffect,
  runProjectStepEffect,
} from "./generate-process.js";

/** Copies and customizes the template before installation.
 * @param stage - Scope-owned sibling directory.
 * @param options - Normalized creation selection.
 * @param context - Template and deterministic failure authority.
 * @returns Lazy materialization; failures abort before publication.
 */
export const materializeGenerationStage = Effect.fn("ProjectGeneration.materializeStage")(
  function* (stage: string, options: CreateOptions, context: GenerateProjectContext) {
    const templateRoot = yield* resolveTemplateRootEffect(context);
    const template = join(templateRoot, options.jobs === undefined ? options.template : "tasks");
    yield* requireTemplateEffect(template);
    yield* domainTry(() => injectGenerateFailure(context, "copy"));
    yield* copyTemplateEffect(template, stage);
    yield* domainTry(() => injectGenerateFailure(context, "substitute"));
    yield* customizeProjectEffect(stage, options);
    yield* requireFilesEffect(stage, [
      "package.json",
      "relkit.config.ts",
      "src/platform/env.ts",
      ".env.example",
      ".gitignore",
    ]);
    yield* prepareProjectDependencyPatchEffect(stage);
  },
  (effect) => observeExecution("generator", "generation.materializeStage", effect),
);

/** Installs dependencies and optional Git metadata inside the private stage.
 * @param stage - Scope-owned sibling directory.
 * @param options - Install/Git creation choices.
 * @param context - Native executable, progress and cancellation authority.
 * @returns Whether Git was initialized; owned subprocesses settle before returning.
 */
export const installGenerationStage = Effect.fn("ProjectGeneration.installStage")(
  function* (stage: string, options: CreateOptions, context: GenerateProjectContext) {
    if (options.install) {
      context.onProgress?.("Installing dependencies...");
      yield* runProjectStepEffect(
        context,
        [context.bunExecutable ?? globalThis.process.execPath, "install"],
        stage,
        "install",
        "install",
      );
    }
    const git =
      context.gitExecutable ??
      (context.commandRunner ? "git" : yield* (yield* GeneratorProcess).which("git"));
    const gitInitialized = options.git && git !== null;
    if (gitInitialized) {
      context.onProgress?.("Initializing Git repository...");
      yield* runProjectStepEffect(context, [git, "init"], stage, "git", "git");
    }
    return gitInitialized;
  },
  (effect) => observeExecution("generator", "generation.installStage", effect),
);

/** Checks prerequisites and prepares a snapshot from one source validation.
 * @param stage - Installed private project root.
 * @param options - Cloud/deployment options controlling existing doctor checks.
 * @param context - Native executable, progress and cancellation authority.
 * @returns Finite preparation completion; failure leaves the destination unpublished.
 */
export const verifyGenerationStage = Effect.fn("ProjectGeneration.prepareStage")(
  function* (stage: string, options: CreateOptions, context: GenerateProjectContext) {
    if (!options.install) return;
    const relkit = yield* resolveRelkitExecutableEffect(context, stage);
    context.onProgress?.("Checking prerequisites...");
    yield* runProjectStepEffect(
      context,
      [
        relkit,
        "doctor",
        "--project-root",
        stage,
        "--no-ports",
        ...(options.cloud === "none" || options.deploy === "none" ? ["--no-pulumi"] : []),
      ],
      stage,
      "doctor",
      "doctor",
    );
    context.onProgress?.("Checking and preparing development snapshot...");
    // Keep the existing check failure-injection contract. The finite command
    // checks once and supplies its accepted result to snapshot preparation.
    yield* runProjectStepEffect(
      context,
      [relkit, "dev", "--prepare", "--project-root", stage],
      stage,
      "prepare",
      "check",
    );
  },
  (effect) => observeExecution("generator", "generation.prepareStage", effect),
);
