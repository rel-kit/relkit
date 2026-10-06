import { join } from "node:path";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { resolveRelkitExecutableEffect } from "./generate-process.js";

import { ADD_FAILURE_CODES, AddScaffoldError, type ScaffoldPlan } from "./add-types.js";

import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorProcess } from "./generator-process.js";
import { domainError } from "./generator-errors.js";

import type { ApplyScaffoldContext } from "./add-transaction.types.js";

/**
 * Checks the mutated project before transaction ownership is committed.
 * @param plan - Complete immutable operation plan.
 * @param context - Caller-owned settings and cancellation.
 * @returns The passed verification status and its stable public check-command description.
 */
export const checkEffect = Effect.fn("ScaffoldTransaction.check")(
  function* (plan: ScaffoldPlan, context: ApplyScaffoldContext) {
    context.onProgress?.("Checking project...");
    const executable = yield* resolveRelkitExecutableEffect(context, plan.projectRoot);
    yield* runEffect(
      context,
      [executable, "check", "--project-root", plan.projectRoot],
      ADD_FAILURE_CODES.validation,
      plan.projectRoot,
    );
    return { status: "passed" as const, command: "bun run check" };
  },
  (effect) => observeExecution("generator", "ScaffoldTransaction.check", effect),
);

/**
 * Runs one install or check command with the transaction's scoped process authority.
 * @param context - Caller-owned settings and cancellation.
 * @param command - Literal executable and argument vector.
 * @param code - Stable category code included in the resulting diagnostic.
 * @param cwd - Working directory for the operation.
 * @returns Completion after the command exits successfully; cancellation/nonzero exit retain public failure codes.
 */
export const runEffect = Effect.fn("ScaffoldTransaction.run")(
  function* (
    context: ApplyScaffoldContext,
    command: readonly string[],
    code: typeof ADD_FAILURE_CODES.installation | typeof ADD_FAILURE_CODES.validation,
    cwd: string,
  ) {
    const result = yield* (yield* GeneratorProcess).run(command, cwd);
    if (context.signal?.aborted) return yield* Effect.fail(domainError(cancelled()));
    if (result.exitCode !== 0)
      return yield* Effect.fail(
        domainError(
          new AddScaffoldError(
            code,
            result.stderr?.trim() || result.stdout?.trim() || `${command[0]} failed.`,
          ),
        ),
      );
  },
  (effect) => observeExecution("generator", "ScaffoldTransaction.run", effect),
);

/**
 * Checks independent package paths with bounded traversal instead of unowned Promise batches.
 * @param root - Absolute project or owned resource root.
 * @param packages - Package names whose installed paths are required.
 * @returns Whether every requested package path is currently accessible.
 */
export const packagesAvailableEffect = Effect.fn("ScaffoldTransaction.packagesAvailable")(
  function* (root: string, packages: readonly string[]) {
    const fs = yield* GeneratorFileSystem;
    const results = yield* Effect.forEach(
      packages,
      (name) =>
        fs.access(join(root, "node_modules", ...name.split("/"))).pipe(
          Effect.as(true),
          Effect.catch(() => Effect.succeed(false)),
        ),
      { concurrency: 4 },
    );
    return results.every(Boolean);
  },
  (effect) => observeExecution("generator", "ScaffoldTransaction.packagesAvailable", effect),
);

/**
 * Constructs the unchanged public cancellation error.
 * @returns The canonical RELKIT_ADD_CANCELLED AddScaffoldError with exit code 130.
 */
export function cancelled(): AddScaffoldError {
  return new AddScaffoldError(ADD_FAILURE_CODES.cancellation, "Scaffolding was cancelled.");
}
