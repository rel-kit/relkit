import { Effect } from "effect";
import { EarlyRetentionError } from "./early-records-error.js";
import type { EarlyRetentionOptions } from "./early-records.types.js";

/**
 * Default bounds of a development session's inspection buffer. A request costs about 4 to 17
 * records (3 to 14 KB) once span revisions are coalesced, so 8,192 records and 8 MiB hold about
 * 25 seconds of 22 requests per second while the Inspector is not collecting.
 */
export const EARLY_RETENTION_DEFAULTS = Object.freeze({ maxRecords: 8_192, maxBytes: 8_388_608 });

/** Validates and completes one mutable early-retention policy. */
export const validateEarlyRetentionOptions = Effect.fn("EarlyRetention.validatePolicy")(function* (
  options: EarlyRetentionOptions,
) {
  const maxRecords = options.maxRecords ?? EARLY_RETENTION_DEFAULTS.maxRecords;
  const maxBytes = options.maxBytes ?? EARLY_RETENTION_DEFAULTS.maxBytes;
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 65_536)
    return yield* new EarlyRetentionError({ operation: "policy.records" });
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 67_108_864)
    return yield* new EarlyRetentionError({ operation: "policy.bytes" });
  return { ...options, maxRecords, maxBytes };
});
