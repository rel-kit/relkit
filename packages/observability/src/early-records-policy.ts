import { Effect } from "effect";
import { EarlyRetentionError } from "./early-records-error.js";
import type { EarlyRetentionOptions } from "./early-records.types.js";

/** Validates and completes one mutable early-retention policy. */
export const validateEarlyRetentionOptions = Effect.fn("EarlyRetention.validatePolicy")(function* (
  options: EarlyRetentionOptions,
) {
  const maxRecords = options.maxRecords ?? 2_048;
  const maxBytes = options.maxBytes ?? 2_097_152;
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 65_536)
    return yield* new EarlyRetentionError({ operation: "policy.records" });
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 67_108_864)
    return yield* new EarlyRetentionError({ operation: "policy.bytes" });
  return { ...options, maxRecords, maxBytes };
});
