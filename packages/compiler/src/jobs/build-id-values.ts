import { runJobsSync } from "./compatibility.js";
import { createHash } from "node:crypto";
import { serializeJsonEffect, type JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord, taskSchemaKey } from "../normalize-utils.js";
import { schemaEffect } from "../normalize-schema-projection.js";

/**
 * Selects task fields that affect executable compatibility.
 * @param value - Task value from which executable fields are selected.
 * @returns only present executable and policy fields.
 */
export function selectFields(value: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    "input",
    "inputWire",
    "output",
    "errors",
    "execution",
    "dependencies",
    "publishes",
    "progress",
    "streams",
    "observation",
    "retry",
    "resources",
    "concurrency",
    "maxDuration",
    "maxElapsed",
    "logging",
    "handler",
    "onStart",
    "onSuccess",
    "onFailure",
  ];
  return Object.fromEntries(
    fields.flatMap((field) => (value[field] === undefined ? [] : [[field, value[field]]])),
  );
}

/**
 * Collects sorted dependency identities and their declared versions.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param value - Declared task dependency structure.
 * @returns A lazy effect yielding the JSON dependency closure.
 * @remarks Requires no services. Unexpected exceptions remain defects.
 */
export const dependencyClosureEffect = Effect.fn("Jobs.dependencyClosure")(function* (
  work: NormalizationWork,
  value: unknown,
) {
  if (!isRecord(value)) return [];
  const refs = new Set<string>();
  collectRefs(value, refs);
  return [...refs].sort().map((reference) => {
    const separator = reference.indexOf("\0");
    const kind = separator < 0 ? "unknown" : reference.slice(0, separator);
    const id = separator < 0 ? reference : reference.slice(separator + 1);
    const descriptor = work.referencesByKind.get(kind)?.get(id);
    return { id, kind: descriptor?.kind ?? kind, version: versionOf(descriptor) };
  });
});

/**
 * Collects nested reference identities for dependency hashing.
 * @param value - Nested dependency value to traverse.
 * @param result - Caller-owned set of collected reference identities.
 * @param visited - Traversal-owned identity set; each shared object is inspected once.
 * @returns nothing; reference keys are accumulated in result.
 */
function collectRefs(value: unknown, result: Set<string>, visited = new WeakSet<object>()): void {
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRefs(entry, result, visited));
    return;
  }
  if (!isRecord(value)) return;
  if (
    isRecord(value.ref) &&
    typeof value.ref.kind === "string" &&
    typeof value.ref.id === "string"
  ) {
    result.add(`${value.ref.kind}\0${value.ref.id}`);
  }
  Object.values(value).forEach((entry) => collectRefs(entry, result, visited));
}

/**
 * Extracts a dependency version without inventing an absent version.
 * @param value - Optional referenced descriptor.
 * @returns the declared version or an empty string.
 */
function versionOf(value: NormalizedDescriptor | undefined): string {
  return isRecord(value?.value) && typeof value.value.version === "string"
    ? value.value.version
    : "";
}

/**
 * Projects existing task schema hashes in both wire directions.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param taskId - Stable task identity used to select schema hashes.
 * @returns the JSON map of available task contract hashes.
 */
export function schemaHashes(work: NormalizationWork, taskId: string): JsonValue {
  return Object.fromEntries(
    ["input", "output", "progress"].flatMap((field) =>
      ["input", "output"].flatMap((direction) => {
        const key = taskSchemaKey(taskId, field, direction as "input" | "output");
        const hashValue = work.schemaHashes.get(key);
        return hashValue === undefined ? [] : [[`${field}:${direction}`, hashValue]];
      }),
    ),
  );
}

/**
 * Projects live values into deterministic JSON for compatibility hashing.
 * @param value - Live descriptor value to project.
 * @param seen - Ancestor set used to detect cycles; entries are removed when a branch completes.
 * @returns a JSON projection with function, schema, and cycle markers.
 * @remarks Ancestor ownership is released by the Effect finalizer so shared sibling values are never classified as cycles.
 */
export const stableValueEffect = Effect.fn("Jobs.stableValue")(function* (
  value: unknown,
  seen = new WeakSet<object>(),
): Effect.fn.Return<JsonValue> {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "function") return { $relkit: "function", source: value.toString() };
  if (typeof value === "undefined") return null;
  if (typeof value !== "object") return { $relkit: typeof value };
  if (seen.has(value)) return { $relkit: "cycle" };
  const projected = yield* schemaEffect(value);
  if (projected.ok && projected.contractHash !== undefined)
    return { $relkit: "schema", contractHash: projected.contractHash };
  seen.add(value);
  return yield* Effect.gen(function* () {
    if (Array.isArray(value))
      return yield* Effect.forEach(value, (entry) => stableValueEffect(entry, seen));
    return Object.fromEntries(
      yield* Effect.forEach(Object.keys(value).sort(), (key) =>
        Effect.gen(function* () {
          return [
            key,
            yield* stableValueEffect((value as Record<string, unknown>)[key], seen),
          ] as const;
        }),
      ),
    );
  }).pipe(Effect.ensuring(Effect.sync(() => seen.delete(value))));
});

/**
 * Projects compatibility JSON at the synchronous jobs boundary.
 * @param value - Live descriptor value to project.
 * @param seen - Caller-owned ancestor set, normally omitted.
 * @returns Deterministic JSON with executable, schema, and cycle markers.
 * @see {@link stableValueEffect} for composable projection.
 */
export function stableValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  return runJobsSync(stableValueEffect(value, seen));
}

/**
 * Hashes canonical UTF-8 JSON with SHA-256.
 * @param value - JSON compatibility projection to hash.
 * @returns A lazy effect yielding the prefixed hexadecimal digest, with JsonValueError for invalid JSON.
 */
export const hashEffect = Effect.fn("Jobs.hash")(function* (value: JsonValue) {
  return `sha256:${createHash("sha256")
    .update(yield* serializeJsonEffect(value), "utf8")
    .digest("hex")}`;
});

/**
 * Reads textual metadata without coercing other values.
 * @param value - Untrusted textual metadata.
 * @returns the textual value or the module's absent-value fallback.
 */
export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
