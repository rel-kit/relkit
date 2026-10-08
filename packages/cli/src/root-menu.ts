import { join, resolve } from "node:path";
import { createClackPromptDriver } from "create-relkit";
import { Effect, Layer } from "effect";
import { CliFileSystem, fileSystemLayer } from "./services/filesystem.service.js";
import { CliInteraction, interactionLayer } from "./cli-interaction.service.js";
import type { RootMenuOptions } from "./cli-interaction.types.js";
import { observeCli, runCliEffect } from "./cli-runtime.js";

/**
 * Preserves the root-menu Promise boundary and native Clack presentation.
 * @param argv - Existing arguments; nonempty input bypasses interaction.
 * @param context - Menu eligibility, root, driver and optional caller signal.
 * @returns Selected arguments after prompt completion.
 */
export function resolveRootMenu(
  argv: readonly string[],
  context: RootMenuOptions,
): Promise<readonly string[]> {
  return runCliEffect(
    resolveRootMenuEffect(argv, context),
    Layer.merge(fileSystemLayer, interactionLayer),
    context.signal,
  );
}

/**
 * Resolves a root action through explicit file and prompt authority.
 * @param argv - Existing arguments.
 * @param context - Menu eligibility and native driver settings.
 * @returns Lazy selected arguments without evaluating project source.
 */
export const resolveRootMenuEffect = Effect.fn("Cli.rootMenu")(
  function* (argv: readonly string[], context: RootMenuOptions) {
    if (argv.length > 0 || !context.enabled) return argv;
    const cwd = resolve(context.cwd ?? process.cwd());
    const files = yield* CliFileSystem;
    const project = (yield* Effect.all(
      [files.exists(join(cwd, "package.json")), files.exists(join(cwd, "relkit.config.ts"))],
      { concurrency: 2 },
    )).every(Boolean);
    const prompt = context.promptDriver ?? createClackPromptDriver("RELKIT_CLI_CANCELLED");
    prompt.intro("RELKIT");
    const action = yield* (yield* CliInteraction).select(
      prompt,
      {
        message: "What would you like to do?",
        options: project
          ? [
              { value: "add", label: "Add an artifact" },
              { value: "dev", label: "Start development" },
              { value: "check", label: "Check the project" },
              { value: "build", label: "Build the project" },
              { value: "local", label: "Manage local services" },
              { value: "doctor", label: "Run doctor" },
              { value: "create", label: "Create another app" },
              { value: "help", label: "Show help" },
            ]
          : [
              { value: "create", label: "Create a new app" },
              { value: "help", label: "Show help" },
            ],
      },
      context.signal,
    );
    if (action === "help") return ["--help"];
    return action === "local" ? ["local", "status"] : [action];
  },
  (effect) => observeCli("root.menu", effect),
);
