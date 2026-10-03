import { Schema } from "effect";
import type { OperationId } from "@relkit/contracts";

/** Nonnegative, safe integer used by persisted revisions, offsets and capacities. */
export const StateCount = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));

/** Stored IDs retain their public brand after crossing the JSON boundary. */
export const StoredOperationId = Schema.declare<OperationId>(
  (value): value is OperationId => typeof value === "string",
);
