import { Schema } from "effect";

/** Existing shutdown budget admission: a nonnegative safe integer. */
export const DrainDeadlineSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.makeFilter((value) => Number.isSafeInteger(value)),
);
