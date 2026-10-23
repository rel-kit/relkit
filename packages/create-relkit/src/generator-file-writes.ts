/** Settles each atomic write and owned-directory mutation before rollback can run. */

import { observeExecution } from "@relkit/contracts/operation";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { Cause, Effect } from "effect";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError } from "./generator-errors.js";
import type { FileSnapshot } from "./add-transaction-files.types.js";
import { recordCleanupFailure } from "./generator-cleanup.js";
export type { FileSnapshot } from "./add-transaction-files.types.js";
/**
 * Writes a sibling temporary file, atomically renames it and cleans only its owned temporary path.
 * @param path - Path inside the current project or owned resource.
 * @param content - Complete bytes or text planned for the destination.
 * @param mode - Optional restored or generated permission mode.
 * @returns Completion after bytes/mode are published by atomic rename and owned temporary cleanup settles.
 */
export const atomicWriteEffect = Effect.fn("ScaffoldFiles.atomicWrite")(
  (path: string, content: string | Uint8Array, mode?: number) =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* GeneratorFileSystem;
        const temporary = yield* Effect.acquireRelease(
          Effect.succeed(`${path}.relkit-${randomUUID()}.tmp`),
          (temporary, exit) =>
            fs
              .remove(temporary, { force: true })
              .pipe(
                Effect.catchCause((cause) =>
                  recordCleanupFailure(exit, "temporary-file", Cause.squash(cause)),
                ),
              ),
        );
        yield* fs.write(temporary, content, mode === undefined ? {} : { mode });
        if (mode !== undefined) yield* fs.chmod(temporary, mode);
        yield* fs.rename(temporary, path);
      }),
    ),
  (effect) => observeExecution("generator", "transaction.files.atomicWrite", effect),
);
/**
 * Records missing parents before ordered writes so rollback removes only directories it created.
 * @param root - Absolute project or owned resource root.
 * @param path - Path inside the current project or owned resource.
 * @param created - Directories created and owned by this transaction.
 * @returns Completion after missing parents are created and atomically registered as transaction-owned.
 */
export const ensureParentEffect = Effect.fn("ScaffoldFiles.ensureParent")(
  function* (root: string, path: string, created: Set<string>) {
    const fs = yield* GeneratorFileSystem;
    const local = relative(root, path);
    if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local))
      return yield* collision(`Scaffold parent escapes the project: ${path}`);
    const missing: string[] = [];
    for (let current = path; current !== root; current = dirname(current)) {
      const metadata = yield* fs.metadata(current);
      if (metadata !== undefined) {
        if (metadata.kind !== "directory")
          return yield* collision(`${relative(root, current)} is not a project directory.`);
        continue;
      }
      missing.push(current);
    }
    yield* Effect.uninterruptible(
      Effect.gen(function* () {
        yield* fs.mkdir(path, { recursive: true });
        for (const directory of missing) created.add(directory);
      }),
    );
  },
  (effect) => observeExecution("generator", "transaction.files.ensureParent", effect),
);
/**
 * Constructs a typed collision failure preserving its public constructor.
 * @param message - Diagnostic explaining the conflicting declaration.
 * @returns An Effect failing with the original RELKIT_ADD_COLLISION AddScaffoldError.
 */
export function collision(message: string) {
  return Effect.fail(domainError(new AddScaffoldError(ADD_FAILURE_CODES.collision, message)));
}
