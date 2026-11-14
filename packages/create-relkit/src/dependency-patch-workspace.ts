/** Registers a dependency patch in `pnpm-workspace.yaml`, the only place pnpm reads patches from. */

import { observeExecution } from "relkit/contracts/operation";
import { join } from "node:path";
import { Effect } from "effect";
import { ADD_FAILURE_CODES, AddScaffoldError, type ScaffoldFileOperation } from "./add-types.js";
import type { DependencyPatch } from "./dependency-patches.types.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError } from "./generator-errors.js";

/**
 * Plans the `patchedDependencies` entry of `pnpm-workspace.yaml`, appending the section when the
 * file has none. An existing section is left to its author unless it already names this patch.
 * @param projectRoot - Absolute project root.
 * @param patch - Verified release-owned repair.
 * @returns The create or update operation for `pnpm-workspace.yaml`.
 */
export const pnpmWorkspacePatchEffect = Effect.fn("DependencyPatch.pnpmWorkspace")(
  function* (projectRoot: string, patch: DependencyPatch) {
    const fs = yield* GeneratorFileSystem;
    const path = "pnpm-workspace.yaml";
    const entry = `  ${patch.key}: ${patch.path}\n`;
    const current =
      (yield* fs.metadata(join(projectRoot, path)))?.kind === "file"
        ? yield* fs.readText(join(projectRoot, path))
        : undefined;
    if (current?.includes(entry)) return { path, action: "update", content: current } as const;
    if (current !== undefined && /^patchedDependencies:/mu.test(current))
      return yield* Effect.fail(
        domainError(
          new AddScaffoldError(
            ADD_FAILURE_CODES.collision,
            `${path} already declares patchedDependencies; add ${patch.key}: ${patch.path} to it.`,
          ),
        ),
      );
    const prefix =
      current === undefined || current.endsWith("\n") ? (current ?? "") : `${current}\n`;
    const operation: ScaffoldFileOperation = {
      path,
      action: current === undefined ? "create" : "update",
      content: `${prefix}patchedDependencies:\n${entry}`,
    };
    return operation;
  },
  (effect) => observeExecution("generator", "planning.pnpmWorkspacePatch", effect),
);
