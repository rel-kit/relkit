import { basename, dirname, join } from "node:path";
import { Cause, Effect, Exit, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import type { CreateOptions } from "./options.js";
import { validateCreateOptionsEffect } from "./validate.js";
import {
  injectGenerateFailure,
  resolveRelkitExecutableEffect,
  runProjectStepEffect,
  throwIfAborted,
} from "./generate-process.js";
import {
  copyTemplateEffect,
  cleanupStagedProjectEffect,
  customizeProjectEffect,
  listProjectFilesEffect,
  requireFilesEffect,
  requireTemplateEffect,
} from "./generate-files.js";
import { createGenerateNextSteps } from "./generate-output.js";
import { prepareProjectDependencyPatchEffect } from "./dependency-patches.js";
import { resolveTemplateRootEffect } from "./template-root.js";
import { GenerateProjectError, type GenerateProjectContext } from "./generate-types.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorProcess } from "./generator-process.js";

import { GeneratorPrompt } from "./generator-prompt.js";

import { domainError, domainTry } from "./generator-errors.js";
import { recordCleanupFailure } from "./generator-cleanup.js";
import { recordStageCleanup } from "./generate-stage-cleanup.js";

/**
 * Validates, prepares, verifies and publishes while a Scope owns the disposable stage.
 * @param options - Explicit options retaining existing defaults.
 * @param context - Caller-owned settings and cancellation.
 * @returns The published project's immutable result after native child settlement and staging cleanup.
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
        )
          return yield* Effect.fail(
            domainError(
              new GenerateProjectError("RELKIT_CREATE_CANCELLED", "Scaffolding was cancelled."),
            ),
          );
        context.onProgress?.(`Creating a new RELKIT app in ${validated.destination}.`);
        const fs = yield* GeneratorFileSystem;
        const templateRoot = yield* resolveTemplateRootEffect(context);
        const template = join(
          templateRoot,
          options.jobs === undefined ? options.template : "tasks",
        );
        yield* requireTemplateEffect(template);
        const owned = yield* Effect.acquireRelease(
          Effect.gen(function* () {
            yield* fs.mkdir(dirname(validated.destination), { recursive: true, mode: 0o755 });
            const stage = yield* fs.temporaryDirectory(
              join(dirname(validated.destination), `.${basename(validated.destination)}-relkit-`),
            );
            return { stage, published: yield* Ref.make(false) };
          }),
          (owned, exit) =>
            Effect.gen(function* () {
              if (yield* Ref.get(owned.published)) return;
              const cleanup = yield* cleanupStagedProjectEffect(
                owned.stage,
                validated.destination,
              ).pipe(
                Effect.catchCause((cause) =>
                  Effect.gen(function* () {
                    const retained = { temporaryPath: owned.stage, removed: false };
                    yield* recordCleanupFailure(
                      Exit.succeed(retained),
                      "stage",
                      Cause.squash(cause),
                    );
                    return retained;
                  }),
                ),
              );
              yield* recordStageCleanup(
                exit,
                cleanup,
                context.signal?.aborted ? context.signal : undefined,
              );
            }),
        );
        yield* domainTry(() => injectGenerateFailure(context, "copy"));
        yield* copyTemplateEffect(template, owned.stage);
        yield* domainTry(() => injectGenerateFailure(context, "substitute"));
        yield* customizeProjectEffect(owned.stage, options);
        yield* requireFilesEffect(owned.stage, [
          "package.json",
          "relkit.config.ts",
          "src/platform/env.ts",
          ".env.example",
          ".gitignore",
        ]);
        yield* prepareProjectDependencyPatchEffect(owned.stage);
        if (options.install) {
          context.onProgress?.("Installing dependencies...");
          yield* runProjectStepEffect(
            context,
            [context.bunExecutable ?? globalThis.process.execPath, "install"],
            owned.stage,
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
          yield* runProjectStepEffect(context, [git, "init"], owned.stage, "git", "git");
        }
        if (options.install) {
          const relkit = yield* resolveRelkitExecutableEffect(context, owned.stage);
          context.onProgress?.("Checking generated project...");
          yield* runProjectStepEffect(
            context,
            [
              relkit,
              "doctor",
              "--project-root",
              owned.stage,
              "--no-ports",
              ...(options.cloud === "none" || options.deploy === "none" ? ["--no-pulumi"] : []),
            ],
            owned.stage,
            "doctor",
            "doctor",
          );
          yield* runProjectStepEffect(
            context,
            [relkit, "check", "--project-root", owned.stage],
            owned.stage,
            "check",
            "check",
          );
        }
        yield* domainTry(() => {
          throwIfAborted(context.signal);
          injectGenerateFailure(context, "rename");
        });
        // Native rename and publication bookkeeping settle as one atomic ownership handoff.
        yield* Effect.uninterruptible(
          fs
            .rename(owned.stage, validated.destination)
            .pipe(Effect.tap(() => Ref.set(owned.published, true))),
        );
        return Object.freeze({
          ok: true as const,
          command: "create" as const,
          name: options.name,
          template: options.template,
          cloud: options.cloud,
          deploy: options.deploy,
          destination: validated.destination,
          files: Object.freeze(yield* listProjectFilesEffect(validated.destination)),
          installed: options.install,
          gitInitialized,
          additions: Object.freeze([]),
          warnings: Object.freeze(
            !options.install
              ? [
                  {
                    code: "validation-skipped",
                    message: "Install dependencies, then run bun run check.",
                  },
                ]
              : [],
          ),
          nextSteps: createGenerateNextSteps(options, validated.destination, context.cwd),
        });
      }),
    ),
  (effect) => observeExecution("generator", "generation.execute", effect),
);
