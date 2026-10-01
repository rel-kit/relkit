import { JsonValueError } from "@relkit/contracts";
import { observeCompiler } from "./observability.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";

export type { SchemaEntry } from "./normalize-compat.types.js";
import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { id, isRecord, refId } from "./normalize-utils.js";
import type { NormalizeInput } from "./normalize-types.js";
import { providerMaps } from "./normalize-graph-app.js";
export {
  isSchema,
  schema,
  type SchemaDirection,
  type SchemaResult,
  schemaHash,
  schemaEffect,
} from "./normalize-schema-projection.js";
import { schemaEffect } from "./normalize-schema-projection.js";

/**
 * Compares canonical JSON Schema projections for two contracts.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns A lazy effect that compares canonical JSON Schema projections for two contracts; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const schemaEquivalentEffect = Effect.fn("Compiler.schemaEquivalent")(
  function* (left: unknown, right: unknown) {
    const a = yield* schemaEffect(left);
    const b = yield* schemaEffect(right);
    return a.ok && b.ok && canonicalJson(a.schema) === canonicalJson(b.schema);
  },
  (effect, left, right) => observeCompiler("normalization", "schemaEquivalent", effect, () => ({})),
);

/**
 * Compares canonical JSON Schema projections for two contracts.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns True when both values have equal available schema projections.
 */
export function schemaEquivalent(left: unknown, right: unknown): boolean {
  return runCompilerSync(schemaEquivalentEffect(left, right));
}

/**
 * Selects object schema properties and required field names.
 * @param value - Declared metadata inspected without coercion.
 * @returns A lazy effect that selects object schema properties and required field names; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const schemaPropertiesEffect = Effect.fn("Compiler.schemaProperties")(
  function* (value: unknown) {
    const result = yield* schemaEffect(value);
    const document = result.schema;
    if (!result.ok || document === undefined || Array.isArray(document) || document === null)
      return undefined;
    const object = document as { readonly [key: string]: JsonValue };
    if (object.type !== "object") return undefined;
    const properties: Readonly<Record<string, JsonValue>> = isRecord(object.properties)
      ? (object.properties as Readonly<Record<string, JsonValue>>)
      : {};
    const required = Array.isArray(object.required)
      ? object.required.filter((item: JsonValue): item is string => typeof item === "string")
      : [];
    return { properties, required };
  },
  (effect, value) => observeCompiler("normalization", "schemaProperties", effect, () => ({})),
);

/**
 * Selects object schema properties and required field names.
 * @param value - Declared metadata inspected without coercion.
 * @returns Object schema properties and required fields, or undefined.
 */
export function schemaProperties(value: unknown):
  | {
      readonly properties: Readonly<Record<string, JsonValue>>;
      readonly required: readonly string[];
    }
  | undefined {
  return runCompilerSync(schemaPropertiesEffect(value));
}

/**
 * Collects field names declared by an input mapping.
 * @param value - Declared metadata inspected without coercion.
 * @returns Field names declared by the input mapping.
 */
export function mappingFields(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  if (value.kind === "input" || value.kind === "nested") {
    return isRecord(value.fields) ? Object.keys(value.fields).sort() : [];
  }
  if (value.kind === "optional" || value.kind === "default" || value.kind === "transform") {
    return mappingFields(value.value);
  }
  return [];
}

/**
 * Checks whether an input mapping supplies required target schema fields.
 * @param mapping - Declared input mapping.
 * @param target - Target contract or metadata being checked.
 * @returns A lazy effect that checks whether an input mapping supplies required target schema fields; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const mappingCompatibleEffect = Effect.fn("Compiler.mappingCompatible")(
  function* (mapping: unknown, target: unknown) {
    if (!isRecord(mapping) || mapping.kind !== "input")
      return "route request must be an input mapping";
    const targetShape = yield* schemaPropertiesEffect(target);
    if (targetShape === undefined) return undefined;
    const fields = new Set(mappingFields(mapping));
    const missing = targetShape.required.filter((name) => !fields.has(name));
    return missing.length === 0
      ? undefined
      : `missing required target input fields: ${missing.join(", ")}`;
  },
  (effect, mapping, target) =>
    observeCompiler("normalization", "mappingCompatible", effect, () => ({})),
);

/**
 * Checks whether an input mapping supplies required target schema fields.
 * @param mapping - Declared input mapping.
 * @param target - Target contract or metadata being checked.
 * @returns An incompatibility message, or undefined when the mapping is compatible.
 */
export function mappingCompatible(mapping: unknown, target: unknown): string | undefined {
  return runCompilerSync(mappingCompatibleEffect(mapping, target));
}

/**
 * Checks whether legacy job input matches its target function contract.
 * @param input - Compiler input and source provenance.
 * @param target - Target contract or metadata being checked.
 * @returns A lazy effect that checks whether legacy job input matches its target function contract; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const jobCompatibleEffect = Effect.fn("Compiler.jobCompatible")(
  function* (input: unknown, target: unknown) {
    const inputSchema = yield* schemaEffect(input);
    const targetSchema = yield* schemaEffect(target);
    if (!inputSchema.ok || !targetSchema.ok) return undefined;
    return (yield* schemaEquivalentEffect(input, target))
      ? undefined
      : "job input schema differs from target input schema";
  },
  (effect, input, target) => observeCompiler("normalization", "jobCompatible", effect, () => ({})),
);

/**
 * Checks whether legacy job input matches its target function contract.
 * @param input - Compiler input and source provenance.
 * @param target - Target contract or metadata being checked.
 * @returns An incompatibility message, or undefined when the job input is compatible.
 */
export function jobCompatible(input: unknown, target: unknown): string | undefined {
  return runCompilerSync(jobCompatibleEffect(input, target));
}

/**
 * Reads the referenced executable target identity.
 * @param value - Declared metadata inspected without coercion.
 * @returns The declared target reference ID, or undefined.
 */
export function targetId(value: unknown): string | undefined {
  return refId(value);
}

/**
 * Checks a cron expression against supported lexical syntax.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when schedule text has an accepted cron-like field count.
 */
export function cronLike(value: unknown): boolean {
  return typeof value === "string" && value.trim().split(/\s+/).length === 5;
}

/**
 * Indexes application and explicit provider profile declarations.
 * @param input - Compiler input and source provenance.
 * @returns Capabilities mapped to their declared provider profile names.
 */
export function providerProfiles(input: NormalizeInput): ReadonlyMap<string, readonly string[]> {
  const profiles = new Map<string, Set<string>>();
  for (const descriptor of input.descriptors ?? []) {
    if (!isRecord(descriptor) || descriptor.kind !== "app") continue;
    for (const [capability, bindings] of providerMaps(descriptor)) {
      if (!isRecord(bindings)) continue;
      for (const name of Object.keys(bindings)) {
        const profileName = id(name) ?? name;
        const set = profiles.get(profileName) ?? new Set<string>();
        set.add(capability);
        profiles.set(profileName, set);
      }
    }
  }
  return new Map([...profiles.entries()].map(([name, values]) => [name, [...values].sort()]));
}

/**
 * Checks whether descriptor metadata can cross a JSON boundary.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when metadata can cross a canonical JSON boundary.
 */
export function isJsonMetadata(value: unknown): value is JsonValue {
  try {
    canonicalJson(value);
    return true;
  } catch (error) {
    if (!(error instanceof JsonValueError)) throw error;
    return false;
  }
}

export { schemaEntries } from "./normalize-schema-entries.js";
