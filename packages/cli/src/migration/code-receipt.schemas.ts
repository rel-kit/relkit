/**
 * The persisted recovery record of a `relkit migrate` code migration. It stores the complete
 * bytes before and after each edited file, and no `before` for files the migration created, so
 * rollback can restore originals and delete only created files that still hold the migrated
 * bytes. It reuses the layout record's bounded path and file snapshot schemas and is told apart
 * from a layout record by `kind: "code"`.
 */
import { Schema } from "effect";
import { LayoutFile, LayoutPath } from "./layout.schemas.js";

export const CodeReceiptEdit = Schema.Struct({
  path: LayoutPath,
  before: Schema.optionalKey(LayoutFile),
  after: LayoutFile,
});

export const CodeReceipt = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("code"),
  root: Schema.String,
  id: Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/)),
  status: Schema.Literals(["prepared", "publishing", "committed", "restored", "recovery-required"]),
  directories: Schema.Array(LayoutPath).check(Schema.isMaxLength(20000)),
  edits: Schema.Array(CodeReceiptEdit).check(Schema.isMaxLength(20000)),
});

export type CodeReceiptRecord = Schema.Schema.Type<typeof CodeReceipt>;
export type CodeReceiptEditRecord = Schema.Schema.Type<typeof CodeReceiptEdit>;
