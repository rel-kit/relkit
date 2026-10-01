import type {
  SchemaDirection,
  SchemaResult,
  SchemaSnapshot,
} from "./normalize-schema-projection.types.js";
export type { SchemaDirection, SchemaResult } from "./normalize-schema-projection.types.js";
import { createHash } from "node:crypto";
import { canonicalJson, type JsonValue } from "@relkit/contracts";
import {
  getJsonSchemaEffect,
  getSchemaMetadataEffect,
  isSchemaTransformedEffect,
  SchemaProjectorLive,
  type StandardSchemaV1,
} from "@relkit/schema";
import { isRecord, json } from "./normalize-utils.js";
import { Effect, Result } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

/**
 * Projects live validators or data-only evaluator markers into a directional contract.
 * @param value - Standard Schema validator or evaluator snapshot.
 * @param direction - Wire direction; legacy retains the public projection selection.
 * @returns A lazy effect yielding projection evidence or an unavailable result.
 * @remarks Only typed projection failures become unavailable evidence; defects propagate.
 * Snapshot markers never become executable validators. Projection uses SchemaProjectorLive.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const schemaEffect = Effect.fn("Compiler.schema")(
  function* (
    value: unknown,
    direction: SchemaDirection = "legacy",
  ): Effect.fn.Return<SchemaResult> {
    if (isSchemaSnapshot(value)) return snapshotResult(value, direction);
    if (!isSchema(value))
      return { ok: false, reason: "value is not a Standard Schema v1 validator" };
    const selected = yield* getJsonSchemaEffect(
      value,
      direction === "legacy" ? undefined : { direction },
    ).pipe(Effect.provide(SchemaProjectorLive), Effect.result);
    if (Result.isFailure(selected)) return { ok: false, reason: selected.failure.reason };
    const input = yield* getJsonSchemaEffect(value, { direction: "input" }).pipe(
      Effect.provide(SchemaProjectorLive),
      Effect.result,
    );
    const output = yield* getJsonSchemaEffect(value, { direction: "output" }).pipe(
      Effect.provide(SchemaProjectorLive),
      Effect.result,
    );
    const transformed = yield* isSchemaTransformedEffect(value);
    const metadata = yield* getSchemaMetadataEffect(value);
    const standard = value["~standard"];
    return {
      ok: true,
      schema: selected.success,
      ...(Result.isSuccess(input) ? { inputSchema: input.success } : {}),
      ...(Result.isSuccess(output) ? { outputSchema: output.success } : {}),
      contractHash: hashContract({
        input: Result.isSuccess(input) ? input.success : null,
        output: Result.isSuccess(output) ? output.success : null,
        direction,
        transformed,
        vendor: standard.vendor,
        validator: standard.validate.toString(),
      }),
      transformed,
      refined: metadata?.refined === true,
    };
  },
  (effect) => observeCompiler("normalization", "schema", effect, () => ({ schemas: 1 })),
);

/**
 * Projects schema evidence at the synchronous compiler boundary.
 * @param value - Validator or evaluator snapshot.
 * @param direction - Selected wire direction.
 * @returns Directional schema evidence or an unavailable result.
 * @see {@link schemaEffect} for lazy projection and recovery.
 */
export function schema(value: unknown, direction: SchemaDirection = "legacy"): SchemaResult {
  return runCompilerSync(schemaEffect(value, direction));
}

/**
 * Recognizes the Standard Schema v1 validation capability.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the value exposes the Standard Schema v1 validation capability.
 */
export function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

/**
 * Reads a projected schema's executable compatibility hash.
 * @param result - Caller-owned collection or projection evidence.
 * @returns The executable compatibility hash, or undefined when unavailable.
 */
export function schemaHash(result: SchemaResult): string | undefined {
  return result.contractHash;
}

/**
 * Selects directional JSON Schema evidence from an evaluator snapshot.
 * @param value - Declared metadata inspected without coercion.
 * @param direction - Selected input, output, or legacy wire direction.
 * @returns Directional projection evidence, or an unavailable reason.
 */
function snapshotResult(value: SchemaSnapshot, direction: SchemaDirection): SchemaResult {
  if (value.$relkit === "schema-unavailable") {
    return { ok: false, reason: typeof value.reason === "string" ? value.reason : "unavailable" };
  }
  const legacy = value.jsonSchema;
  const input = value.inputJsonSchema ?? legacy;
  const output = value.outputJsonSchema ?? legacy;
  const selected =
    direction === "input" ? input : direction === "output" ? output : (legacy ?? output ?? input);
  if (!json(selected)) {
    return { ok: false, reason: "schema snapshot has no JSON Schema projection" };
  }
  return {
    ok: true,
    schema: selected,
    ...(json(input) ? { inputSchema: input } : {}),
    ...(json(output) ? { outputSchema: output } : {}),
    contractHash:
      typeof value.contractHash === "string"
        ? value.contractHash
        : hashContract({
            input: json(input) ? input : null,
            output: json(output) ? output : null,
            direction,
          }),
    ...(value.transformed === true ? { transformed: true } : {}),
    ...(value.refined === true ? { refined: true } : {}),
  };
}

/**
 * Recognizes data-only evaluator schema provenance markers.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when metadata carries a data-only schema provenance marker.
 */
function isSchemaSnapshot(value: unknown): value is SchemaSnapshot {
  return isRecord(value) && typeof value.$relkit === "string" && value.$relkit.startsWith("schema");
}

/**
 * Hashes canonical directional schema contract metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns A SHA-256 hash of canonical directional contract metadata.
 */
function hashContract(value: JsonValue): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}
