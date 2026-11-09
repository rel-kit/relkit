import { Schema } from "effect";

/** Source revisions include zero and otherwise require positive safe integers. */
export const SourceVersionSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
