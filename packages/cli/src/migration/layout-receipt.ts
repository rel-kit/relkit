/** Persists restricted recovery snapshots atomically without exposing file bytes in results. */
import { dirname, join, resolve, relative } from "node:path";
import { lstat } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { cliPromise, cliValidation } from "../cli-errors.js";
import { fail } from "../main-support.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { LayoutReceipt } from "./layout.schemas.js";
import type { MigrationPlan, MigrationReceipt } from "./layout.types.js";
import { validateLayoutReceipt } from "./layout-receipt-policy.js";
import { assertReceiptParents } from "./layout-receipt-parents.js";
import { missingLayoutDirectories } from "./layout-directories.js";

/**
 * Creates owner-only recovery storage before coordinated publication begins.
 * @param plan - Exact before/after edit set.
 * @returns Receipt identity and absolute local path.
 */
export const createLayoutReceipt = Effect.fn("Migration.receipt.create")(function* (
  plan: MigrationPlan,
) {
  const fs = yield* CliFileSystem;
  const id = crypto.randomUUID();
  const directory = join(plan.root, ".relkit", "migrations", id);
  yield* cliPromise("migration.receipt.parents", () => assertReceiptParents(plan.root, directory));
  yield* fs.mkdir(directory);
  yield* fs.chmod(directory, 0o700);
  const receipt = {
    version: 1,
    root: plan.root,
    id,
    status: "prepared",
    directories: yield* cliPromise("migration.directories.capture", () =>
      missingLayoutDirectories(plan.root, plan.edits),
    ),
    edits: plan.edits,
  } satisfies MigrationReceipt;
  const path = join(directory, "receipt.json");
  yield* fs.writeExclusive(path, JSON.stringify(receipt), 0o600);
  return { path, receipt };
});

/**
 * Atomically records an operation status using exclusive temporary bytes.
 * @param path - Owned receipt path.
 * @param receipt - Validated recovery record.
 * @param status - Next operation status.
 * @returns The new immutable record after native write/rename settle.
 */
export const updateLayoutReceipt = Effect.fn("Migration.receipt.update")(function* (
  path: string,
  receipt: MigrationReceipt,
  status: MigrationReceipt["status"],
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
 * Decodes a local receipt and binds its mutation authority to this exact project.
 * @param root - Canonical caller-selected project root.
 * @param path - Caller-supplied receipt location.
 * @returns Validated recovery record; foreign roots/paths fail before mutation.
 */
export const readLayoutReceipt = Effect.fn("Migration.receipt.read")(function* (
  root: string,
  path: string,
) {
  const fs = yield* CliFileSystem;
  const location = resolve(root, path);
  yield* cliValidation(() => {
    if (
      !/^\.relkit\/migrations\/[a-f0-9-]{36}\/receipt\.json$/.test(
        relative(root, location).replaceAll("\\", "/"),
      )
    )
      throw fail(
        "RELKIT_LAYOUT_RECEIPT_INVALID",
        "Rollback requires this project's restricted local receipt path.",
      );
  });
  yield* cliPromise("migration.receipt.permissions", async () => {
    await assertReceiptParents(root, dirname(location));
    for (const target of [dirname(location), location]) {
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0)
        throw fail(
          "RELKIT_LAYOUT_RECEIPT_INVALID",
          "Recovery receipt permissions or ownership are invalid.",
        );
    }
  });
  const text = yield* fs.readText(location);
  const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(LayoutReceipt))(
    text,
  ).pipe(
    Effect.mapError(() =>
      fail(
        "RELKIT_LAYOUT_RECEIPT_INVALID",
        "Local recovery receipt is malformed; its contents were not disclosed.",
      ),
    ),
  );
  yield* cliValidation(() => validateLayoutReceipt(root, location, receipt));
  return { path: location, receipt };
});
