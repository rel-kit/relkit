#!/usr/bin/env bun
import { spinner } from "@clack/prompts";
import { Effect, Logger, References } from "effect";
import { generateProjectEffect, projectGenerationLive } from "./generate.js";
import { formatGenerateResult } from "./generate-output.js";
import { resolveCreateOptionsDetailsEffect } from "./create-resolver.js";
import { createClackPromptDriver } from "./prompt-driver.js";
import { generatorPromptLayer } from "./generator-prompt.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { generationError } from "./generate-process.js";
import { GenerateProjectError } from "./generate-types.js";
import { stageCleanupFor } from "./generate-stage-cleanup.js";
import { transferCleanupFailures } from "./generator-cleanup.js";

/**
 * Runs the executable presentation boundary with invocation-owned signal listeners.
 * @param args - Literal command arguments, excluding the Bun and script paths.
 * @returns Completion after generation scopes and presentation cleanup have settled.
 * @remarks The library barrel has no executable side effects. Generation owns final consent.
 */
async function main(args: readonly string[]): Promise<void> {
  const json = args.includes("--json");
  const interactive = !json && !process.env.CI && process.stdin.isTTY === true;
  const prompt = createClackPromptDriver("RELKIT_CREATE_CANCELLED");
  const progress = interactive ? spinner() : undefined;
  const controller = new AbortController();
  let progressStarted = false;
  const onProgress = (message: string): void => {
    if (progress === undefined || message.startsWith("Creating a new RELKIT app")) return;
    if (!progressStarted) {
      progress.start(message);
      progressStarted = true;
    } else progress.message(message);
  };
  const logging = Logger.layer([
    Logger.make(({ logLevel }) => {
      if (logLevel === "Warn")
        process.stderr.write("Generator resource cleanup failed; inspect cleanup diagnostics.\n");
    }),
  ]);
  const program = Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const interrupt = (): void =>
            controller.abort(
              new GenerateProjectError(
                "RELKIT_INTERRUPTED",
                "Generation was interrupted.",
                undefined,
                130,
              ),
            );
          const terminate = (): void =>
            controller.abort(
              new GenerateProjectError(
                "RELKIT_INTERRUPTED",
                "Generation was terminated.",
                undefined,
                143,
              ),
            );
          process.on("SIGINT", interrupt);
          process.on("SIGTERM", terminate);
          return { interrupt, terminate };
        }),
        ({ interrupt, terminate }) =>
          Effect.sync(() => {
            process.off("SIGINT", interrupt);
            process.off("SIGTERM", terminate);
          }),
      );
      if (interactive) prompt.intro("Create a RELKIT app");
      const resolved = yield* resolveCreateOptionsDetailsEffect(args, { json, interactive });
      return yield* generateProjectEffect(resolved.options, {
        interactive,
        signal: controller.signal,
        onProgress,
      });
    }),
  ).pipe(
    Effect.provide(projectGenerationLive),
    Effect.provide(generatorPromptLayer(prompt)),
    Effect.provide(logging),
    Effect.provideService(References.MinimumLogLevel, "Warn"),
  );
  try {
    const result = await runGeneratorPromise(program, controller.signal);
    if (progressStarted) progress?.stop("Project created.");
    process.stdout.write(`${json ? JSON.stringify(result) : formatGenerateResult(result)}\n`);
  } catch (error) {
    if (progressStarted) progress?.error("Project creation failed.");
    const owner = controller.signal.aborted ? controller.signal : error;
    const failure = transferCleanupFailures(
      owner,
      generationError(
        controller.signal.aborted ? controller.signal.reason : error,
        "RELKIT_CREATE_FAILED",
        stageCleanupFor(owner),
      ),
    );
    const output = json
      ? JSON.stringify({ ok: false, error: { code: failure.code, message: failure.message } })
      : `${failure.code}: ${failure.message}`;
    (json ? process.stdout : process.stderr).write(`${output}\n`);
    process.exitCode = failure.exitCode;
  }
}

if (import.meta.main) await main(process.argv.slice(2));
