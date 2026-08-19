import type { JsonValue } from "@zsys/contracts";
import { getJsonSchema, type StandardSchemaV1 } from "@zsys/schema";
import type { EvaluatorDescriptorSnapshot } from "./evaluator-protocol.js";

/** Keeps descriptor identity while replacing executable values with JSON markers. */
export function snapshotDescriptor(value: SnapshotDescriptorLike): EvaluatorDescriptorSnapshot {
  return {
    kind: value.kind,
    id: value.id,
    ref: { kind: value.ref.kind, id: value.ref.id },
    metadata: snapshotValue(value, new WeakSet<object>()),
  };
}

function snapshotValue(value: unknown, seen: WeakSet<object>, depth = 0): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : marker("non-finite-number");
  if (typeof value === "undefined") return marker("undefined");
  if (typeof value === "function") return marker("function", value.name);
  if (typeof value === "symbol") return marker("symbol", value.description);
  if (typeof value === "bigint") return marker("bigint");
  const schema = snapshotSchema(value);
  if (schema !== undefined) return schema;
  if (depth > 8) return marker("depth-limit");
  if (seen.has(value)) return marker("cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => snapshotValue(entry, seen, depth + 1));
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      output[key] =
        descriptor && "value" in descriptor
          ? snapshotValue(descriptor.value, seen, depth + 1)
          : marker("accessor");
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export interface SnapshotDescriptorLike {
  readonly kind: string;
  readonly id: string;
  readonly ref: { readonly kind: string; readonly id: string };
}

function snapshotSchema(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  const standard = dataProperty(value, "~standard");
  if (!isRecord(standard) || standard.version !== 1 || typeof standard.validate !== "function") {
    return undefined;
  }
  const result = getJsonSchema(value as unknown as StandardSchemaV1);
  return result.ok
    ? { $zsys: "schema", jsonSchema: result.schema }
    : { $zsys: "schema-unavailable", reason: result.reason };
}

function dataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function marker(type: string, name?: string): JsonValue {
  return name === undefined ? { $zsys: type } : { $zsys: type, name };
}
