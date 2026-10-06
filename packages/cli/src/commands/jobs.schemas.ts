import { Schema } from "effect";

/** Backend-issued identity; no credentials are reconstructed by the CLI. */
export const JobsIdentitySchema = Schema.Struct({
  identityScope: Schema.String,
  sessionEpoch: Schema.String,
  publicFingerprint: Schema.String,
});
/** Unknown JSON objects remain opaque until each owner validates its fields. */
export const JobsRecordSchema = Schema.Record(Schema.String, Schema.Unknown);
/** Optional compiler-owned manifest projection, without inventing entry contracts. */
export const JobsManifestSchema = Schema.Struct({
  jobs: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  recipes: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  serviceGenerations: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  jobsProtocolVersion: Schema.optionalKey(Schema.Number),
});
/** Opaque native iterator identity; methods retain their original receiver. */
export const JobsIteratorSchema = Schema.declare<AsyncIterator<unknown>>(
  (value): value is AsyncIterator<unknown> =>
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "next" in value &&
    typeof value.next === "function" &&
    (!("return" in value) || value.return === undefined || typeof value.return === "function"),
);
/** Opaque native iterable identity, validated before requesting its iterator once. */
export const JobsIterableSchema = Schema.declare<AsyncIterable<unknown>>(
  (value): value is AsyncIterable<unknown> =>
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === "function",
);
