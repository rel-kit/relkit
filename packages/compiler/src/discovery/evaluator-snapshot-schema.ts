import { canCarryStandardSchema, serializeJsonEffect, type JsonValue } from "@relkit/contracts";
import {
  getJsonSchemaEffect,
  getSchemaMetadataEffect,
  isSchemaTransformedEffect,
  schemaLibraryVersion,
  SchemaProjectorLive,
  type StandardSchemaV1,
} from "@relkit/schema";
import { Effect } from "effect";
import { createHash } from "node:crypto";
import { observeCompiler } from "../observability.js";
import { EvaluatorSchemaSnapshot } from "./evaluator-protocol-schema.js";
import { ownDataProperty, schemaHasAccessorsEffect } from "./evaluator-snapshot-capabilities.js";

/**
 * Projects a recognized Standard Schema using its existing Effect contracts.
 * @param value - Metadata node that may carry Standard Schema capabilities.
 * @returns A lazy effect yielding schema provenance or undefined for ordinary metadata.
 * @remarks Only known unavailable projections become markers; other defects remain visible.
 */
export const snapshotSchemaEffect = Effect.fn("Discovery.snapshotSchema")(
  function* (value: unknown) {
    if (!canCarryStandardSchema(value)) return undefined;
    const standard = standardCapability(value);
    if (!isRecord(standard)) return undefined;
    const version = ownDataProperty(standard, "version");
    const validate = ownDataProperty(standard, "validate");
    if (version !== 1 || typeof validate !== "function") return undefined;
    if (yield* schemaHasAccessorsEffect(value, standard)) {
      return EvaluatorSchemaSnapshot.make({
        $relkit: "schema-unavailable",
        reason: "Schema projection capabilities contain accessors",
      });
    }
    // The capability guard establishes the external Standard Schema contract.
    const schema = value as unknown as StandardSchemaV1;
    const results = yield* Effect.forEach([undefined, "input", "output"] as const, (direction) =>
      getJsonSchemaEffect(schema, direction === undefined ? undefined : { direction }).pipe(
        Effect.provide(SchemaProjectorLive),
        Effect.result,
      ),
    );
    const [legacy, input, output] = results;
    if (legacy === undefined || input === undefined || output === undefined)
      return yield* Effect.die(new Error("Missing schema projections"));
    if (legacy._tag === "Failure" && input._tag === "Failure" && output._tag === "Failure") {
      return EvaluatorSchemaSnapshot.make({
        $relkit: "schema-unavailable",
        reason: legacy.failure.reason,
      });
    }
    const projections = {
      ...(legacy._tag === "Success" ? { jsonSchema: legacy.success } : {}),
      ...(input._tag === "Success" ? { inputJsonSchema: input.success } : {}),
      ...(output._tag === "Success" ? { outputJsonSchema: output.success } : {}),
    };
    const transformed = yield* isSchemaTransformedEffect(schema);
    const metadata = yield* getSchemaMetadataEffect(schema);
    const library = schemaLibrary(standard);
    const contract: JsonValue = {
      projections,
      transformed,
      validator: Function.prototype.toString.call(validate),
      ...(library === undefined ? {} : { library }),
    };
    const serialized = yield* serializeJsonEffect(contract).pipe(Effect.orDie);
    return EvaluatorSchemaSnapshot.make({
      $relkit: "schema",
      ...projections,
      contractHash: `sha256:${createHash("sha256").update(serialized, "utf8").digest("hex")}`,
      ...(transformed ? { transformed: true } : {}),
      ...(metadata?.refined === true ? { refined: true } : {}),
      ...(library === undefined ? {} : { library }),
    });
  },
  (effect) => observeCompiler("discovery", "snapshotSchema", effect, () => ({}), false),
);

/**
 * Reads the `~standard` capability. Libraries such as Zod 4 define it as an inherited getter,
 * so the getter runs once when no data property exists; its body is the schema library's own
 * code, like the projection hooks that run next.
 * @param value - Metadata node.
 * @returns The capability object, or undefined for ordinary metadata.
 */
function standardCapability(value: Record<string, unknown>): unknown {
  const own = ownDataProperty(value, "~standard");
  if (own !== undefined) return own;
  if (!("~standard" in value)) return undefined;
  try {
    return Reflect.get(value, "~standard");
  } catch {
    return undefined;
  }
}

/**
 * Names the installed library that made a schema, so its version joins the build fingerprint.
 * @param standard - The schema's `~standard` capability.
 * @returns Vendor and version for a recognized third-party library, otherwise undefined.
 */
function schemaLibrary(
  standard: Record<string, unknown>,
): { readonly vendor: string; readonly version: string } | undefined {
  const vendor = ownDataProperty(standard, "vendor");
  if (typeof vendor !== "string") return undefined;
  const version = schemaLibraryVersion(vendor, process.cwd());
  return version === undefined ? undefined : { vendor, version };
}

/**
 * Narrows non-array objects for descriptor inspection.
 * @param value - Metadata node.
 * @returns Whether native own-property inspection is applicable.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
