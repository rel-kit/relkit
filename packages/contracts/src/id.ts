const STABLE_ID_PATTERN = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

declare const StableIdBrand: unique symbol;
declare const ProtocolIdBrand: unique symbol;

/** A validated identifier whose value is independent of a source path. */
export type StableId = string & { readonly [StableIdBrand]: "StableId" };

/** Alias used by descriptor contracts for stable IDs. */
export type DescriptorId = StableId;

/** A stable identifier used to address a versioned protocol value. */
export type ProtocolId<Name extends string = "ProtocolId"> = StableId & {
  readonly [ProtocolIdBrand]: Name;
};

export type GraphHash = ProtocolId<"GraphHash">;
export type GenerationId = ProtocolId<"GenerationId">;
export type RequestId = ProtocolId<"RequestId">;
export type TraceId = ProtocolId<"TraceId">;
export type InvocationId = ProtocolId<"InvocationId">;
export type EventInstanceId = ProtocolId<"EventInstanceId">;

/** The descriptor kinds represented by the public v3 contracts. */
export type DescriptorKind =
  | "app"
  | "function"
  | "service"
  | "route"
  | "middleware"
  | "job"
  | "event"
  | "event-trigger"
  | "bucket"
  | "cache"
  | "tool"
  | "agent"
  | "constants"
  | "prompt";

/** A typed reference to a descriptor identified by an explicit stable ID. */
export interface Ref<Kind extends DescriptorKind, Id extends string = string> {
  readonly kind: Kind;
  readonly id: Id;
}

/** Raised when an identifier is missing or cannot be normalized safely. */
export class StableIdError extends TypeError {
  constructor(reason: string) {
    super(`Invalid stable ID: ${reason}`);
    this.name = "StableIdError";
  }
}

export { StableIdError as IdError, StableIdError as IdValidationError };

/** Trims and validates an explicit stable ID without deriving it from a path. */
export function normalizeId(value: unknown): StableId {
  if (typeof value !== "string") {
    throw new StableIdError("expected a string");
  }

  const normalized = value.normalize("NFC").trim();
  if (normalized.length === 0) {
    throw new StableIdError("expected a non-empty value");
  }
  if (!STABLE_ID_PATTERN.test(normalized)) {
    throw new StableIdError("use letters, numbers, '.', '_' or '-' between alphanumeric segments");
  }
  return normalized as StableId;
}

/** Returns whether a value is already a canonical stable ID. */
export function isStableId(value: unknown): value is StableId {
  if (typeof value !== "string" || value !== value.trim()) return false;
  return STABLE_ID_PATTERN.test(value);
}

export const isValidId = isStableId;

/** Asserts that a value is already a canonical stable ID. */
export function assertStableId(value: unknown): asserts value is StableId {
  if (!isStableId(value)) {
    throw new StableIdError("expected a canonical stable ID");
  }
}

export const assertValidId = assertStableId;

/** Normalizes an explicit protocol ID while preserving its nominal type. */
export function normalizeProtocolId(value: unknown): ProtocolId {
  return normalizeId(value) as ProtocolId;
}

/** Returns whether a value is a canonical protocol ID. */
export function isProtocolId(value: unknown): value is ProtocolId {
  return isStableId(value);
}

export const toGraphHash = (value: unknown): GraphHash =>
  normalizeProtocolId(value) as unknown as GraphHash;
export const toGenerationId = (value: unknown): GenerationId =>
  normalizeProtocolId(value) as unknown as GenerationId;
export const toRequestId = (value: unknown): RequestId =>
  normalizeProtocolId(value) as unknown as RequestId;
export const toTraceId = (value: unknown): TraceId =>
  normalizeProtocolId(value) as unknown as TraceId;
export const toInvocationId = (value: unknown): InvocationId =>
  normalizeProtocolId(value) as unknown as InvocationId;
export const toEventInstanceId = (value: unknown): EventInstanceId =>
  normalizeProtocolId(value) as unknown as EventInstanceId;
