import { type DescriptorKind, type Ref, isStableId, normalizeId } from "./id.js";

/** The shared runtime brand used by every RelKit descriptor factory. */
export const RELKIT_DESCRIPTOR: unique symbol = Symbol.for("relkit.descriptor");

/** Common serializable metadata shared by all public descriptors. */
export interface DescriptorMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

/** The immutable common shape implemented by every public descriptor. */
export interface DescriptorBase<
  Kind extends DescriptorKind,
  Id extends string = string,
> extends DescriptorMetadata {
  readonly [RELKIT_DESCRIPTOR]: true;
  readonly kind: Kind;
  readonly id: Id;
  readonly ref: Ref<Kind, Id>;
}

/** A descriptor whose concrete kind and ID are not known by the caller. */
export type DescriptorAny = DescriptorBase<DescriptorKind, string>;

const descriptorKinds: readonly DescriptorKind[] = [
  "app",
  "function",
  "service",
  "route",
  "middleware",
  "job",
  "event",
  "event-trigger",
  "bucket",
  "cache",
  "tool",
  "agent",
  "constants",
  "prompt",
];

/** Creates a normalized immutable reference without deriving identity from a path. */
export function createRef<Kind extends DescriptorKind, Id extends string>(
  kind: Kind,
  id: Id,
): Ref<Kind, Id> {
  return Object.freeze({ kind, id: normalizeId(id) as unknown as Id });
}

/** Returns whether a value is a supported descriptor kind. */
export function isDescriptorKind(value: unknown): value is DescriptorKind {
  return typeof value === "string" && descriptorKinds.includes(value as DescriptorKind);
}

/** Returns whether a value has the exact portable descriptor-reference shape. */
export function isRef(value: unknown): value is Ref<DescriptorKind, string>;
export function isRef<Kind extends DescriptorKind>(
  value: unknown,
  kind: Kind,
): value is Ref<Kind, string>;
export function isRef(value: unknown, kind?: DescriptorKind): value is Ref<DescriptorKind, string> {
  if (!isRecord(value) || !hasOwn(value, "kind") || !hasOwn(value, "id")) return false;
  return (
    Reflect.ownKeys(value).length === 2 &&
    isDescriptorKind(value.kind) &&
    isStableId(value.id) &&
    (kind === undefined || value.kind === kind)
  );
}

/** Asserts that a value is a valid descriptor reference. */
export function assertRef(value: unknown): asserts value is Ref<DescriptorKind, string>;
export function assertRef<Kind extends DescriptorKind>(
  value: unknown,
  kind: Kind,
): asserts value is Ref<Kind, string>;
export function assertRef(value: unknown, kind?: DescriptorKind): void {
  if (!isRef(value) || (kind !== undefined && value.kind !== kind)) {
    throw new TypeError("Invalid RelKit descriptor reference");
  }
}

/** Returns whether a value is a branded descriptor with a matching stable reference. */
export function isDescriptor(value: unknown): value is DescriptorAny;
export function isDescriptor<Kind extends DescriptorKind>(
  value: unknown,
  kind: Kind,
): value is DescriptorBase<Kind, string>;
export function isDescriptor(value: unknown, kind?: DescriptorKind): value is DescriptorAny {
  if (!isRecord(value) || !hasOwn(value, RELKIT_DESCRIPTOR) || value[RELKIT_DESCRIPTOR] !== true) {
    return false;
  }
  if (!hasOwn(value, "kind") || !hasOwn(value, "id") || !hasOwn(value, "ref")) return false;
  return (
    isDescriptorKind(value.kind) &&
    (kind === undefined || value.kind === kind) &&
    isStableId(value.id) &&
    isRef(value.ref) &&
    value.ref.kind === value.kind &&
    value.ref.id === value.id
  );
}

/** Asserts that a value is a branded descriptor with a valid stable reference. */
export function assertDescriptor(value: unknown): asserts value is DescriptorAny {
  if (!isDescriptor(value)) throw new TypeError("Invalid RelKit descriptor");
}

/** Builds the shared descriptor fields used by later pure public factories. */
export function createDescriptorBase<Kind extends DescriptorKind, Id extends string>(
  kind: Kind,
  id: Id,
  metadata: DescriptorMetadata = {},
): DescriptorBase<Kind, Id> {
  const tags = metadata.tags === undefined ? undefined : Object.freeze([...metadata.tags]);
  const value = {
    [RELKIT_DESCRIPTOR]: true as const,
    kind,
    id: normalizeId(id) as unknown as Id,
    ...(metadata.title === undefined ? {} : { title: metadata.title }),
    ...(metadata.description === undefined ? {} : { description: metadata.description }),
    ...(tags === undefined ? {} : { tags }),
    ref: createRef(kind, id),
  };
  return deepFreeze(value) as DescriptorBase<Kind, Id>;
}

/** Recursively freezes object data without invoking accessors or looping on cycles. */
export function deepFreeze<T>(value: T): T {
  freezeObject(value, new WeakSet<object>());
  return value;
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

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
