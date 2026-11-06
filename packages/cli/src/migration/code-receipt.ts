/**
 * Creates, updates and reads code-migration recovery records under `.relkit/migrations/<id>`,
 * with the same owner-only permissions, atomic status updates and project binding as layout
 * records. Records never reach command output; results show only their path.
 */
import { dirname, join, relative, resolve } from "node:path";
import { lstat } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { cliPromise, cliValidation } from "../cli-errors.js";
import { fail } from "../main-support.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { assertReceiptParents } from "./layout-receipt-parents.js";
import { missingLayoutDirectories } from "./layout-directories.js";
import { fileHash } from "./layout-paths.js";
import {
  CodeReceipt,
  type CodeReceiptEditRecord,
  type CodeReceiptRecord,
} from "./code-receipt.schemas.js";

/**
 * Writes a prepared record before any project file changes.
 * @param root - Canonical project root.
 * @param edits - Exact before/after snapshots.
 * @returns The record path and contents.
 */
export const createCodeReceipt = Effect.fn("Migration.code.receipt.create")(function* (
  root: string,
  edits: readonly CodeReceiptEditRecord[],
) {
  const fs = yield* CliFileSystem;
  const id = crypto.randomUUID();
  const directory = join(root, ".relkit", "migrations", id);
  yield* cliPromise("migration.receipt.parents", () => assertReceiptParents(root, directory));
  yield* fs.mkdir(directory);
  yield* fs.chmod(directory, 0o700);
  const created = edits
    .filter((edit) => edit.before === undefined)
    .map((edit) => ({ before: edit.after, after: edit.after }));
  const receipt: CodeReceiptRecord = {
    version: 1,
    kind: "code",
    root,
    id,
    status: "prepared",
    directories: yield* cliPromise("migration.directories.capture", () =>
      missingLayoutDirectories(root, created),
    ),
    edits,
  };
  const path = join(directory, "receipt.json");
  yield* fs.writeExclusive(path, JSON.stringify(receipt), 0o600);
  return { path, receipt };
});

/**
 * Atomically replaces a record's status.
 * @param path - Record path.
 * @param receipt - Current record.
 * @param status - Next status.
 * @returns The updated record.
 */
export const updateCodeReceipt = Effect.fn("Migration.code.receipt.update")(function* (
  path: string,
  receipt: CodeReceiptRecord,
  status: CodeReceiptRecord["status"],
) {
  const fs = yield* CliFileSystem;
  const next = { ...receipt, status };
  yield* cliPromise("migration.receipt.parents", () =>
    assertReceiptParents(receipt.root, dirname(path)),
  );
  const temporary = join(dirname(path), `receipt-${crypto.randomUUID()}.tmp`);
  yield* fs.writeExclusive(temporary, JSON.stringify(next), 0o600);
  yield* fs.rename(temporary, path);
  return next;
});

/**
 * Reads and validates a record that belongs to this project.
 * @param root - Canonical project root.
 * @param path - Caller-supplied record path.
 * @returns The record; foreign, tampered or loosely permitted records fail before any change.
 */
export const readCodeReceipt = Effect.fn("Migration.code.receipt.read")(function* (
  root: string,
  path: string,
) {
  const fs = yield* CliFileSystem;
  const location = resolve(root, path);
  const invalid = (message: string) => fail("RELKIT_MIGRATE_RECEIPT_INVALID", message);
  yield* cliValidation(() => {
    if (
      !/^\.relkit\/migrations\/[a-f0-9-]{36}\/receipt\.json$/.test(
        relative(root, location).replaceAll("\\", "/"),
      )
    )
      throw invalid(
        "Rollback needs a migration record from this project's .relkit/migrations directory.",
      );
  });
  yield* cliPromise("migration.receipt.permissions", async () => {
    await assertReceiptParents(root, dirname(location));
    for (const target of [dirname(location), location]) {
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0)
        throw invalid("The migration record has the wrong permissions or owner.");
    }
  });
  const text = yield* fs.readText(location);
  const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(CodeReceipt))(text).pipe(
    Effect.mapError(() =>
      invalid(
        "This is not a relkit migrate record; layout records roll back with relkit migrate layout.",
      ),
    ),
  );
  yield* cliValidation(() => {
    if (
      receipt.root !== root ||
      location !== join(root, ".relkit", "migrations", receipt.id, "receipt.json")
    )
      throw invalid("The migration record does not belong to this project.");
    for (const edit of receipt.edits)
      for (const file of [edit.before, edit.after])
        if (
          file !== undefined &&
          (file.path !== edit.path || fileHash(Buffer.from(file.bytes, "base64")) !== file.hash)
        )
          throw invalid("Recovery byte integrity failed.");
  });
  return { path: location, receipt };
});
