import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { normalizeIdEffect } from "./id.js";
import type { DescriptorBase, DescriptorMetadata } from "./descriptor.types.js";
import type { DescriptorKind, Ref } from "./id.types.js";
import type { StableIdError } from "./id.js";

export type { DescriptorAny, DescriptorBase, DescriptorMetadata } from "./descriptor.types.js";
export {
  assertDescriptor,
  assertDescriptorEffect,
  assertRef,
  assertRefEffect,
  DescriptorError,
  DescriptorReferenceError,
  isDescriptor,
  isDescriptorEffect,
  isDescriptorKind,
  isDescriptorKindEffect,
  isRef,
  isRefEffect,
} from "./descriptor-validation.js";

/** The shared runtime brand used by every RelKit descriptor factory. */
export const RELKIT_DESCRIPTOR: unique symbol = Symbol.for("relkit.descriptor");

export const DESCRIPTOR_KINDS: readonly DescriptorKind[] = [
  "app",
  "function",
  "service",
  "route",
  "middleware",
  "task",
  "job",
  "event",
  "event-trigger",
  "bucket",
  "cache",
  "tool",
  "agent",
  "channel",
  "constants",
  "prompt",
];

/**
 * Creates an immutable reference with a normalized stable ID.
 * @param kind - Descriptor kind.
 * @param id - Explicit stable ID.
 * @returns An Effect containing the frozen reference, or StableIdError.
 * @example Effect.runSync(createRefEffect("route", "orders.get"));
 */
export function createRefEffect<Kind extends DescriptorKind, Id extends string>(
  kind: Kind,
  id: Id,
): Effect.Effect<Ref<Kind, Id>, StableIdError> {
  return observeContract(
    "descriptor.create-ref",
    Effect.map(normalizeIdEffect(id), (normalized) =>
      Object.freeze({ kind, id: normalized as unknown as Id }),
    ),
  );
}

/**
 * Synchronous compatibility factory for descriptor references.
 * @param kind - Descriptor kind.
 * @param id - Explicit stable ID.
 * @returns A frozen reference.
 * @throws StableIdError for invalid IDs.
 * @example createRef("route", "orders.get");
 */
export function createRef<Kind extends DescriptorKind, Id extends string>(
  kind: Kind,
  id: Id,
): Ref<Kind, Id> {
  return runContract(createRefEffect(kind, id));
}

/**
 * Builds immutable shared fields for a public descriptor factory.
 * @param kind - Descriptor kind.
 * @param id - Explicit stable ID.
 * @param metadata - Optional title, description, and tags.
 * @returns An Effect containing the frozen descriptor base, or StableIdError.
 * @example Effect.runSync(createDescriptorBaseEffect("route", "orders.get"));
 */
export function createDescriptorBaseEffect<Kind extends DescriptorKind, Id extends string>(
  kind: Kind,
  id: Id,
  metadata: DescriptorMetadata = {},
): Effect.Effect<DescriptorBase<Kind, Id>, StableIdError> {
  return observeContract(
    "descriptor.create-base",
    Effect.gen(function* () {
      const normalized = yield* normalizeIdEffect(id);
      const ref = yield* createRefEffect(kind, id);
      const tags = metadata.tags === undefined ? undefined : Object.freeze([...metadata.tags]);
      const value = {
        [RELKIT_DESCRIPTOR]: true as const,
        kind,
        id: normalized as unknown as Id,
        ...(metadata.title === undefined ? {} : { title: metadata.title }),
        ...(metadata.description === undefined ? {} : { description: metadata.description }),
        ...(tags === undefined ? {} : { tags }),
        ref,
      };
      const frozen = yield* deepFreezeEffect(value);
      return frozen as DescriptorBase<Kind, Id>;
    }),
  );
}

/**
 * Synchronous compatibility factory for common descriptor fields.
 * @param kind - Descriptor kind.
 * @param id - Explicit stable ID.
 * @param metadata - Optional title, description, and tags.
 * @returns The frozen descriptor base.
 * @throws StableIdError for invalid IDs.
 * @example createDescriptorBase("route", "orders.get");
 */
export function createDescriptorBase<Kind extends DescriptorKind, Id extends string>(
  kind: Kind,
  id: Id,
  metadata: DescriptorMetadata = {},
): DescriptorBase<Kind, Id> {
  return runContract(createDescriptorBaseEffect(kind, id, metadata));
}

/**
 * Recursively freezes object data without invoking accessors or looping on cycles.
 * @param value - Object graph to freeze in place.
 * @returns An Effect containing the same frozen value.
 * @example Effect.runSync(deepFreezeEffect({ a: { b: 1 } }));
 */
export function deepFreezeEffect<T>(value: T): Effect.Effect<T> {
  return observeContract(
    "descriptor.deep-freeze",
    Effect.sync(() => {
      freezeObject(value, new WeakSet<object>());
      return value;
    }),
  );
}

/**
 * Synchronous compatibility adapter for recursive freezing.
 * @param value - Object graph to freeze in place.
 * @returns The same frozen value.
 * @throws When a proxy prevents property inspection or freezing.
 * @example deepFreeze({ a: { b: 1 } });
 */
export function deepFreeze<T>(value: T): T {
  return runContract(deepFreezeEffect(value));
}

function freezeObject(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (property && "value" in property) freezeObject(property.value, seen);
  }
  Object.freeze(value);
}
