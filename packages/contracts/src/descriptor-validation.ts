import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { DESCRIPTOR_KINDS, RELKIT_DESCRIPTOR } from "./descriptor.js";
import { isStableIdEffect } from "./id.js";
import type { DescriptorAny, DescriptorBase } from "./descriptor.types.js";
import type { DescriptorKind, Ref } from "./id.types.js";

export {
  assertDescriptor,
  assertDescriptorEffect,
  assertRef,
  assertRefEffect,
  DescriptorError,
  DescriptorReferenceError,
} from "./descriptor-assertions.js";

/**
 * Checks whether a value names a supported descriptor kind.
 * @param value - Candidate kind.
 * @returns An Effect containing the validation result.
 * @example Effect.runSync(isDescriptorKindEffect("route"));
 */
export function isDescriptorKindEffect(value: unknown): Effect.Effect<boolean> {
  return observeContract(
    "descriptor.is-kind",
    Effect.sync(
      () => typeof value === "string" && DESCRIPTOR_KINDS.includes(value as DescriptorKind),
    ),
  );
}

/**
 * Synchronous predicate for descriptor kinds.
 * @param value - Candidate kind.
 * @returns Whether the kind is supported; narrows the input type.
 * @example if (isDescriptorKind(value)) useKind(value);
 */
export function isDescriptorKind(value: unknown): value is DescriptorKind {
  return runContract(isDescriptorKindEffect(value));
}

/**
 * Checks the exact portable shape of a descriptor reference.
 * @param value - Candidate reference.
 * @param kind - Optional required descriptor kind.
 * @returns An Effect containing the validation result.
 * @example Effect.runSync(isRefEffect({ kind: "route", id: "orders.get" }, "route"));
 */
export function isRefEffect(value: unknown, kind?: DescriptorKind): Effect.Effect<boolean> {
  return observeContract(
    "descriptor.is-ref",
    Effect.gen(function* () {
      if (!isRecord(value) || !hasOwn(value, "kind") || !hasOwn(value, "id")) return false;
      if (Reflect.ownKeys(value).length !== 2) return false;
      if (!(yield* isDescriptorKindEffect(value.kind))) return false;
      if (!(yield* isStableIdEffect(value.id))) return false;
      return kind === undefined || value.kind === kind;
    }),
  );
}

/**
 * Synchronous predicate for a portable descriptor reference.
 * @param value - Candidate reference.
 * @param kind - Optional required descriptor kind.
 * @returns Whether the reference is valid; narrows its TypeScript type.
 * @example if (isRef(value, "route")) useRoute(value);
 */
/** Validates any supported descriptor reference. */
export function isRef(value: unknown): value is Ref<DescriptorKind, string>;
/** Validates a reference with the supplied descriptor kind. */
export function isRef<Kind extends DescriptorKind>(
  value: unknown,
  kind: Kind,
): value is Ref<Kind, string>;
/**
 * Implements reference validation for both overloads.
 * @param value - Candidate reference.
 * @param kind - Optional required kind.
 * @returns Whether the candidate has an exact, valid reference shape.
 * @example isRef({ kind: "route", id: "orders.get" });
 */
export function isRef(value: unknown, kind?: DescriptorKind): value is Ref<DescriptorKind, string> {
  return runContract(isRefEffect(value, kind));
}

/**
 * Checks a branded descriptor and its matching stable reference.
 * @param value - Candidate descriptor.
 * @param kind - Optional required kind.
 * @returns An Effect containing the validation result.
 * @example Effect.runSync(isDescriptorEffect(candidate, "route"));
 */
export function isDescriptorEffect(value: unknown, kind?: DescriptorKind): Effect.Effect<boolean> {
  return observeContract(
    "descriptor.is-descriptor",
    Effect.gen(function* () {
      if (
        !isRecord(value) ||
        !hasOwn(value, RELKIT_DESCRIPTOR) ||
        value[RELKIT_DESCRIPTOR] !== true
      )
        return false;
      if (!hasOwn(value, "kind") || !hasOwn(value, "id") || !hasOwn(value, "ref")) return false;
      if (!(yield* isDescriptorKindEffect(value.kind))) return false;
      if (kind !== undefined && value.kind !== kind) return false;
      if (!(yield* isStableIdEffect(value.id))) return false;
      if (!(yield* isRefEffect(value.ref))) return false;
      const ref = value.ref as Ref<DescriptorKind, string>;
      return ref.kind === value.kind && ref.id === value.id;
    }),
  );
}

/**
 * Synchronous predicate for branded RelKit descriptors.
 * @param value - Candidate descriptor.
 * @param kind - Optional required kind.
 * @returns Whether the descriptor is valid; narrows its TypeScript type.
 * @example if (isDescriptor(value, "route")) useRoute(value);
 */
/** Validates any branded descriptor. */
export function isDescriptor(value: unknown): value is DescriptorAny;
/** Validates a branded descriptor with the supplied kind. */
export function isDescriptor<Kind extends DescriptorKind>(
  value: unknown,
  kind: Kind,
): value is DescriptorBase<Kind, string>;
/**
 * Implements branded descriptor validation for both overloads.
 * @param value - Candidate descriptor.
 * @param kind - Optional required kind.
 * @returns Whether the candidate has valid branding and matching reference.
 * @example isDescriptor(candidate, "route");
 */
export function isDescriptor(value: unknown, kind?: DescriptorKind): value is DescriptorAny {
  return runContract(isDescriptorEffect(value, kind));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
