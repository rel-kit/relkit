import { open, unlink } from "node:fs/promises";
import { Effect, Exit } from "effect";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { CleanupIssue } from "./cleanup.types.js";
import type { ExclusiveFileNative } from "./filesystem-exclusive.types.js";
import { CliCleanup } from "./cleanup.service.js";

const native: ExclusiveFileNative = {
  open: (path, mode) => open(path, "wx", mode),
  remove: unlink,
};

/**
 * Creates a file exclusively and removes partial writes only after ownership is proven.
 * @param path - New temporary destination.
 * @param text - Complete UTF-8 contents.
 * @param mode - Initial permissions.
 * @param driver - Replaceable native handle authority for controlled failure tests.
 * @returns Physical write and close completion; original failure retains secondary receipts.
 * @remarks The native mutation is masked through write, close and any rollback. An
 * EEXIST open failure never grants unlink authority over someone else's file.
 */
export const writeExclusiveEffect = Effect.fn("CliFileSystem.exclusive")(
  function* (path: string, text: string, mode: number, driver: ExclusiveFileNative = native) {
    const cleanup = yield* CliCleanup;
    const handle = yield* cliPromise("filesystem.exclusive.open", () => driver.open(path, mode));
    const written = yield* Effect.exit(
      cliPromise("filesystem.exclusive.write", () => handle.writeFile(text)),
    );
    const closed = yield* Effect.exit(
      cliPromise("filesystem.exclusive.close", () => handle.close()),
    );
    const primary = Exit.isFailure(written) ? written : Exit.isFailure(closed) ? closed : undefined;
    if (!primary) return;
    const removed = yield* Effect.exit(
      cliPromise("filesystem.exclusive.rollback", () => driver.remove(path)),
    );
    const issues: CleanupIssue[] = [];
    if (Exit.isFailure(written) && Exit.isFailure(closed))
      issues.push({ operation: "filesystem.exclusive.close", cause: closed.cause });
    if (Exit.isFailure(removed))
      issues.push({ operation: "filesystem.exclusive.rollback", cause: removed.cause });
    yield* Effect.forEach(issues, (issue) => cleanup.record(issue.operation, issue.cause), {
      discard: true,
    });
    return yield* Effect.failCause(primary.cause);
  },
  (effect, _path: string, _text: string, _mode: number, _driver?: ExclusiveFileNative) =>
    observeCli("filesystem.exclusive", effect.pipe(Effect.uninterruptible)),
);
