import { observeExecution } from "@relkit/contracts/operation";

import { randomUUID } from "node:crypto";

import { dirname, relative, resolve, sep } from "node:path";

import { Cause, Effect, Exit } from "effect";

import { ADD_FAILURE_CODES, AddScaffoldError, type ScaffoldFileOperation } from "./add-types.js";

import { GeneratorFileSystem } from "./generator-filesystem.js";

import { domainError, hasErrno } from "./generator-errors.js";

import type { FileSnapshot } from "./add-transaction-files.types.js";

import { recordCleanupFailure } from "./generator-cleanup.js";

export type { FileSnapshot } from "./add-transaction-files.types.js";

/**
 * Resolves one relative operation while rejecting broad and escaping paths.
 * @param root - Absolute project root.
 * @param path - Planned source-relative path.
 * @returns Safe absolute destination.
 */
export function operationPath(root: string, path: string): string {
  const absolute = resolve(root, path);
  const local = relative(root, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`))
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.collision,
      `Scaffold path escapes the project: ${path}`,
    );
  return absolute;
}

/**
 * Snapshots bytes and modes, including both Bun lock formats when installation is required.
 * @param root - Absolute project or owned resource root.
 * @param operations - Ordered planned create/update file operations.
 * @param includeLock - Whether install may mutate either Bun lock format.
 * @returns Original bytes/modes for touched files and required Bun lockfiles, read with bounded concurrency.
 */
export const snapshotFilesEffect = Effect.fn("ScaffoldFiles.snapshot")(
  function* (root: string, operations: readonly ScaffoldFileOperation[], includeLock: boolean) {
    const fs = yield* GeneratorFileSystem;
    const paths = new Set(operations.map((operation) => operationPath(root, operation.path)));
    if (includeLock) {
      paths.add(resolve(root, "bun.lock"));
      paths.add(resolve(root, "bun.lockb"));
    }
    return yield* Effect.forEach(
      [...paths],
      (path) =>
        Effect.gen(function* () {
          const metadata = yield* fs.metadata(path);
          if (metadata === undefined) return { path };
          if (metadata.kind !== "file") return yield* collision(`${path} is not a regular file.`);
          return { path, content: yield* fs.readBytes(path), mode: metadata.mode };
        }),
      { concurrency: 4 },
    );
  },
  (effect) => observeExecution("generator", "transaction.files.snapshot", effect),
);

/**
 * Validates every destination before any transaction write, retaining deterministic error order.
 * @param root - Absolute project or owned resource root.
 * @param operations - Ordered planned create/update file operations.
 * @returns Completion when every ordered operation passes path/action/collision preflight.
 */
export const validateOperationActionsEffect = Effect.fn("ScaffoldFiles.validate")(
  function* (root: string, operations: readonly ScaffoldFileOperation[]) {
    const fs = yield* GeneratorFileSystem;
    const seen = new Set<string>();
    yield* Effect.forEach(operations, (operation) =>
      Effect.gen(function* () {
        const path = operationPath(root, operation.path);
        if (seen.has(path))
          return yield* collision(`Scaffold plan contains duplicate path ${operation.path}.`);
        seen.add(path);
        const exists = (yield* fs.metadata(path)) !== undefined;
        if (operation.action === "create" && exists)
          return yield* collision(`${operation.path} already exists.`);
        if (operation.action === "update" && !exists)
          return yield* collision(`${operation.path} does not exist.`);
      }),
    );
  },
  (effect) => observeExecution("generator", "transaction.files.validate", effect),
);

/**
 * Applies planned files in order; each temporary atomic-write asset has its own scope.
 * @param root - Absolute project or owned resource root.
 * @param operations - Ordered planned create/update file operations.
 * @param createdDirectories - Directories owned by this transaction.
 * @returns Completion after all ordered atomic writes and owned temporary-file cleanup settle.
 */
export const applyFileOperationsEffect = Effect.fn("ScaffoldFiles.apply")(
  function* (
    root: string,
    operations: readonly ScaffoldFileOperation[],
    createdDirectories: Set<string>,
  ) {
    yield* Effect.forEach(operations, (operation) =>
      Effect.gen(function* () {
        const path = operationPath(root, operation.path);
        yield* ensureParentEffect(root, dirname(path), createdDirectories);
        yield* atomicWriteEffect(path, operation.content, operation.mode);
      }),
    );
  },
  (effect) => observeExecution("generator", "transaction.files.apply", effect),
);

/**
 * Restores all touched files even when one restoration fails, then removes only owned empty directories.
 * @param snapshots - Pre-mutation bytes and permission snapshots.
 * @param createdDirectories - Directories owned by this transaction.
 * @returns Completion after every restoration and owned directory cleanup attempt; failures retain secondary evidence.
 */
export const restoreFilesEffect = Effect.fn("ScaffoldFiles.restore")(
  function* (snapshots: readonly FileSnapshot[], createdDirectories: ReadonlySet<string>) {
    const fs = yield* GeneratorFileSystem;
    const exits = yield* Effect.forEach([...snapshots].reverse(), (snapshot) =>
      Effect.exit(
        snapshot.content === undefined
          ? fs.remove(snapshot.path, { force: true })
          : atomicWriteEffect(snapshot.path, snapshot.content, snapshot.mode),
      ),
    );
    const directoryExits = yield* Effect.forEach(
      [...createdDirectories].sort((a, b) => b.length - a.length),
      (path) =>
        Effect.exit(
          fs.removeDirectory(path).pipe(
            Effect.catchIf(
              (cause) => hasErrno(cause, "ENOENT") || hasErrno(cause, "ENOTEMPTY"),
              () => Effect.void,
            ),
          ),
        ),
    );
    const failures = [...exits, ...directoryExits].filter(Exit.isFailure);
    const first = failures[0];
    if (first !== undefined) {
      for (const failure of failures.slice(1))
        yield* recordCleanupFailure(first, "rollback", Cause.squash(failure.cause));
      return yield* Effect.failCause(first.cause);
    }
  },
  (effect) => observeExecution("generator", "transaction.files.restore", effect),
);

/**
 * Writes a sibling temporary file, atomically renames it and cleans only its owned temporary path.
 * @param path - Path inside the current project or owned resource.
 * @param content - Complete bytes or text planned for the destination.
 * @param mode - Optional restored or generated permission mode.
 * @returns Completion after bytes/mode are published by atomic rename and owned temporary cleanup settles.
 */
const atomicWriteEffect = Effect.fn("ScaffoldFiles.atomicWrite")(
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
const ensureParentEffect = Effect.fn("ScaffoldFiles.ensureParent")(
  function* (root: string, path: string, created: Set<string>) {
    const fs = yield* GeneratorFileSystem;
    const missing: string[] = [];
    for (let current = path; current !== root; current = dirname(current)) {
      const metadata = yield* fs.metadata(current);
      if (metadata !== undefined) {
        if (metadata.kind !== "directory")
          return yield* collision(`${relative(root, current)} is not a project directory.`);
        break;
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
function collision(message: string) {
  return Effect.fail(domainError(new AddScaffoldError(ADD_FAILURE_CODES.collision, message)));
}

export {
  snapshotFiles,
  validateOperationActions,
  applyFileOperations,
  restoreFiles,
} from "./add-transaction-files-compat.js";
