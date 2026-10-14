/** Bounds recovery receipt data before any persisted path reaches mutation authority. */
import { Schema } from "effect";

/** Authored relative paths permit normal filenames, never traversal or owned state. */
export const LayoutPath = Schema.String.check(
  Schema.isMaxLength(4096),
  Schema.isPattern(
    /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!\.relkit\/)(?!node_modules\/)[^\0\\]+$/,
  ),
);
export const LayoutFile = Schema.Struct({
  path: LayoutPath,
  bytes: Schema.String.check(
    Schema.isPattern(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  ),
  mode: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 4095 })),
  hash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
export const LayoutEdit = Schema.Struct({
  before: LayoutFile,
  after: LayoutFile,
});
export const LayoutReceipt = Schema.Struct({
  version: Schema.Literal(1),
  root: Schema.String,
  id: Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/)),
  status: Schema.Literals(["prepared", "publishing", "committed", "restored", "recovery-required"]),
  directories: Schema.Array(LayoutPath).check(Schema.isMaxLength(20000)),
  edits: Schema.Array(LayoutEdit).check(Schema.isMaxLength(20000)),
});
