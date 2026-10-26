/** Resolves installed project tooling without global fallback or implicit package installation. */

import { observeExecution } from "@relkit/contracts/operation";
import { Effect } from "effect";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorProcess } from "./generator-process.js";
import { domainError } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { join } from "node:path";

import {
  GenerateProjectError,
  type GenerateCommandResult,
  type GenerateProjectContext,
} from "./generate-types.js";

/**
 * Resolves the supported CLI using filesystem and process authority without importing it.
 * @param context - Caller-owned settings and cancellation.
 * @param root - Absolute project or owned resource root.
 * @returns The explicit or project-local relkit executable for project checks.
 */
export const resolveRelkitExecutableEffect = Effect.fn("ProjectGeneration.resolveCli")(
  function* (
    context: Pick<GenerateProjectContext, "relkitExecutable" | "commandRunner">,
    root: string,
  ) {
    if (context.relkitExecutable !== undefined) return context.relkitExecutable;
    if (context.commandRunner !== undefined) return "relkit";
    const fs = yield* GeneratorFileSystem;
    for (const candidate of [join(root, "node_modules/.bin/relkit")]) {
      const available = yield* fs.access(candidate).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      );
      if (available) return candidate;
    }
    return yield* Effect.fail(
      domainError(
        new GenerateProjectError(
          "RELKIT_CREATE_CLI_UNAVAILABLE",
          "The relkit CLI is not available for project checks.",
        ),
      ),
    );
  },
  (effect) => observeExecution("generator", "generation.resolveCli", effect),
);
/**
 * Preserves the CLI executable Promise API.
 * @param context - Caller-owned settings and cancellation.
 * @param root - Absolute project or owned resource root.
 * @returns The resolved CLI executable path after validating the supplied or available binary.
 */
export function resolveRelkitExecutable(
  context: GenerateProjectContext,
  root: string,
): Promise<string> {
  return runGeneratorPromise(resolveRelkitExecutableEffect(context, root));
}
/**
 * Runs a native child at the compatibility edge, with interruption owned by its resource scope.
 * @param command - Executable and literal arguments.
 * @param cwd - Working directory.
 * @param signal - Optional caller cancellation.
 * @returns Output and exit status after the child has been awaited.
 */
export function runProjectCommand(
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<GenerateCommandResult> {
  return runGeneratorPromise(
    GeneratorProcess.use((process) => process.run(command, cwd)),
    signal,
  );
}
