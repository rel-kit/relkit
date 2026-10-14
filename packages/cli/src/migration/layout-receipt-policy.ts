/** Checks recovery ownership and byte integrity without native reads or source disclosure. */
import { join } from "node:path";
import { fail } from "../main-support.js";
import { fileHash } from "./layout-paths.js";
import type { MigrationReceipt } from "./layout.types.js";

/**
 * Rejects foreign, protected, duplicate and tampered recovery edit authority.
 * @param root - Canonical caller-selected project root.
 * @param location - Exact local receipt path.
 * @param receipt - Decoded restricted recovery record.
 * @returns No value after ownership and byte checks succeed.
 * @throws CliFailureError For invalid recovery authority.
 */
export function validateLayoutReceipt(
  root: string,
  location: string,
  receipt: MigrationReceipt,
): void {
  const expected = join(root, ".relkit", "migrations", receipt.id, "receipt.json");
  if (receipt.root !== root || location !== expected)
    throw fail("RELKIT_LAYOUT_RECEIPT_INVALID", "Receipt does not belong to this project.");
  for (const directory of receipt.directories) {
    if (
      !receipt.edits.some((edit) => edit.after.path.startsWith(directory + "/")) ||
      /(?:^|\/)(?:\.git|\.relkit|node_modules|\.env[^/]*|credentials|migrations)(?:\/|$)/.test(
        directory,
      )
    )
      throw fail("RELKIT_LAYOUT_RECEIPT_INVALID", "Receipt has invalid directory ownership.");
  }
  const paths = new Set<string>();
  const outputs = new Set<string>();
  for (const edit of receipt.edits) {
    for (const file of [edit.before, edit.after]) {
      if (
        /(?:^|\/)(?:\.git|node_modules|\.env[^/]*|credentials|migrations)(?:\/|$)/.test(file.path)
      )
        throw fail("RELKIT_LAYOUT_RECEIPT_INVALID", `Receipt touches protected path: ${file.path}`);
    }
    if (paths.has(edit.before.path) || outputs.has(edit.after.path))
      throw fail("RELKIT_LAYOUT_RECEIPT_INVALID", "Receipt has duplicate edit ownership.");
    paths.add(edit.before.path);
    outputs.add(edit.after.path);
  }
  for (const edit of receipt.edits) {
    if (edit.before.path !== edit.after.path && paths.has(edit.after.path))
      throw fail("RELKIT_LAYOUT_RECEIPT_INVALID", "Receipt has overlapping edit ownership.");
  }
  for (const edit of receipt.edits) {
    for (const file of [edit.before, edit.after]) {
      if (fileHash(Buffer.from(file.bytes, "base64")) !== file.hash)
        throw fail("RELKIT_LAYOUT_RECEIPT_INVALID", "Recovery byte integrity failed.");
    }
  }
}
