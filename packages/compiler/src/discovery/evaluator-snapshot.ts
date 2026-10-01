import { observeCompiler } from "../observability.js";
import { createHash } from "node:crypto";
import type { JsonValue } from "@relkit/contracts";
import { Effect, Schema } from "effect";
import {
  isSnapshotErrorDescriptorEffect,
  ownDataProperty,
} from "./evaluator-snapshot-capabilities.js";
import type { EvaluatorDescriptorSnapshot } from "./evaluator-protocol.types.js";
import type { SnapshotDescriptorLike } from "./evaluator-snapshot.types.js";
import { snapshotSchemaEffect } from "./evaluator-snapshot-schema.js";
import { runDiscoverySync } from "./discovery-sync.js";

export type { SnapshotDescriptorLike } from "./evaluator-snapshot.types.js";

/** Trusted descriptor identity shape; metadata is inspected without executing accessors. */
export const SnapshotDescriptorShape = Schema.Struct({
  kind: Schema.String,
  id: Schema.String,
  ref: Schema.Struct({ kind: Schema.String, id: Schema.String }),
});

/** JSON-safe markers representing values that cannot cross the process boundary. */
const SnapshotMarker = Schema.Struct({
  $relkit: Schema.String,
  name: Schema.optionalKey(Schema.String),
  owner: Schema.optionalKey(Schema.String),
  role: Schema.optionalKey(Schema.String),
  sourceHash: Schema.optionalKey(Schema.String),
});

/**
 * Retains descriptor identity while snapshotting metadata without executing it.
 * @param value - Trusted descriptor whose enumerable data properties are inspected.
 * @returns A lazy effect yielding JSON-safe metadata and executable markers.
 * @remarks Cycles and depth are bounded. Accessor bodies and validator string overrides never run.
 */
export const snapshotDescriptorEffect = Effect.fn("Discovery.snapshotDescriptor")(
  function* (value: SnapshotDescriptorLike) {
    return {
      kind: value.kind,
      id: value.id,
      ref: { kind: value.ref.kind, id: value.ref.id },
      metadata: yield* snapshotValue(value, new WeakSet<object>(), 0, value.kind),
    } satisfies EvaluatorDescriptorSnapshot;
  },
  (effect, value) =>
    observeCompiler("discovery", "snapshotDescriptor", effect, () => ({ descriptors: 1 }), false),
);

/**
 * Snapshots metadata at the legacy synchronous compiler boundary.
 * @param value - Trusted descriptor identity and metadata.
 * @returns A data-only snapshot without executing descriptor functions.
 */
export function snapshotDescriptor(value: SnapshotDescriptorLike): EvaluatorDescriptorSnapshot {
  return runDiscoverySync(snapshotDescriptorEffect(value));
}

/**
 * Converts one metadata value while retaining ancestor ownership and recursion limits.
 * @param value - Metadata node.
 * @param seen - Ancestors currently being traversed, owned by this snapshot.
 * @param depth - Current nesting depth, capped at eight.
 * @param ownerKind - Descriptor kind used to identify task executable roles.
 * @param field - Parent property name used for task handler/hook markers.
 * @returns A lazy effect yielding a JSON-safe value.
 */
const snapshotValue: (
  value: unknown,
  seen: WeakSet<object>,
  depth?: number,
  ownerKind?: string,
  field?: string,
) => Effect.Effect<JsonValue> = Effect.fn("Discovery.snapshotValue")(function* (
  value,
  seen,
  depth = 0,
  ownerKind,
  field,
) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : marker("non-finite-number");
  if (typeof value === "undefined") return marker("undefined");
  if (depth > 8) return marker("depth-limit");
  if (typeof value === "function") {
    const nameValue = ownDataProperty(value, "name");
    const name = typeof nameValue === "string" ? nameValue : "";
    return (yield* isSnapshotErrorDescriptorEffect(value))
      ? yield* snapshotObject(value, seen, depth, ownerKind)
      : yield* executableMarkerEffect(
          ownerKind,
          field,
          name,
          Function.prototype.toString.call(value),
        );
  }
  if (typeof value === "symbol") return marker("symbol", value.description);
  if (typeof value === "bigint") return marker("bigint");
  const schema = yield* snapshotSchemaEffect(value);
  if (schema !== undefined) return schema;
  if (Array.isArray(value)) {
    if (seen.has(value)) return marker("cycle");
    seen.add(value);
    return yield* Effect.gen(function* () {
      const output: JsonValue[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        output.push(
          descriptor === undefined
            ? marker("undefined")
            : "value" in descriptor
              ? yield* snapshotValue(descriptor.value, seen, depth + 1, ownerKind, field)
              : marker("accessor"),
        );
      }
      return output;
    }).pipe(Effect.ensuring(Effect.sync(() => seen.delete(value))));
  }
  return yield* snapshotObject(value, seen, depth, ownerKind);
});

/**
 * Snapshots enumerable own data properties in sorted order.
 * @param value - Object or branded error constructor to inspect.
 * @param seen - Snapshot-local ancestor set.
 * @param depth - Current nesting depth.
 * @param ownerKind - Descriptor kind propagated to task markers.
 * @returns A lazy effect yielding a JSON object or cycle marker.
 */
const snapshotObject = Effect.fn("Discovery.snapshotObject")(function* (
  value: object,
  seen: WeakSet<object>,
  depth: number,
  ownerKind?: string,
): Effect.fn.Return<JsonValue> {
  if (seen.has(value)) return marker("cycle");
  seen.add(value);
  return yield* Effect.gen(function* () {
    const output: Record<string, JsonValue> = {};
    yield* Effect.forEach(
      Object.keys(value).sort(),
      (key) =>
        Effect.gen(function* () {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          output[key] =
            descriptor && "value" in descriptor
              ? yield* snapshotValue(descriptor.value, seen, depth + 1, ownerKind, key)
              : marker("accessor");
        }),
      { discard: true },
    );
    return output;
  }).pipe(Effect.ensuring(Effect.sync(() => seen.delete(value))));
});

/**
 * Creates a trusted JSON marker for a non-serializable leaf value.
 * @param type - Marker kind.
 * @param name - Optional executable or symbol name.
 * @returns A schema-modeled JSON marker.
 */
function marker(type: string, name?: string): JsonValue {
  return SnapshotMarker.make({ $relkit: type, ...(name === undefined ? {} : { name }) });
}

/**
 * Identifies task handlers/hooks without invoking their function bodies.
 * @param ownerKind - Owning descriptor kind.
 * @param field - Parent field name.
 * @param name - Function name.
 * @param source - Intrinsic function source text.
 * @returns A lazy effect yielding a JSON marker with a source hash for task handlers and hooks.
 */
const executableMarkerEffect = Effect.fn("Discovery.executableMarker")(function* (
  ownerKind: string | undefined,
  field: string | undefined,
  name: string,
  source: string,
): Effect.fn.Return<JsonValue> {
  if (
    ownerKind !== "task" ||
    !["handler", "onStart", "onSuccess", "onFailure"].includes(field ?? "")
  )
    return marker("function", name);
  return SnapshotMarker.make({
    $relkit: "function",
    name,
    owner: "task",
    role: field === "handler" ? "handler" : "hook",
    sourceHash: `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`,
  });
});
