/**
 * Keeps foreign cohort JSON inside bounded schema decoding. Callers supply
 * already bounded bytes and an exact codec; this leaf never grants executable
 * authority and preserves failures as safe snapshot rejection diagnostics.
 */
import { Effect, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { DevSnapshotRejected } from "./snapshot-error.js";

/**
 * Parses JSON immediately to Effect's precise JSON value contract.
 * @param bytes - Complete bounded UTF-8 document.
 * @returns Lazy decoded JSON or typed malformed document rejection.
 */
export function snapshotJson(bytes: Uint8Array) {
  return Effect.try({
    try: () =>
      Schema.decodeUnknownSync(Schema.Json)(JSON.parse(Buffer.from(bytes).toString("utf8"))),
    catch: () => cohortRejected("cohort.json"),
  });
}

/**
 * Decodes a cohort document with its complete runtime codec.
 * @typeParam S - Precise codec selected by the document owner.
 * @param schema - Owner's bounded schema with its exact decoding service requirements.
 * @param bytes - Complete document bytes already bounded by file authority.
 * @returns Exact document and required services, or typed rejection with mixed Causes preserved.
 */
export function decodeSnapshotJson<S extends Schema.Constraint>(schema: S, bytes: Uint8Array) {
  return Effect.suspend(() =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(Buffer.from(bytes).toString("utf8")),
  ).pipe(mapErrorCause(() => cohortRejected("cohort.decode")));
}

/**
 * Constructs a safe cohort failure without retaining document content.
 * @param operation - Fixed integrity context used by safe-path diagnostics.
 * @returns Expected rejection; defects and interruptions are not translated.
 */
export function cohortRejected(operation: string) {
  return new DevSnapshotRejected({ reason: "integrity", operation });
}
