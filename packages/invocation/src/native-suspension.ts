import { Cause } from "effect";

const NATIVE_SUSPENSION = Symbol.for("relkit.native-suspension");

/** A provider-owned continuation value that is not an invocation outcome. */
export class NativeSuspension extends Error {
  readonly code = "RELKIT_NATIVE_SUSPENSION" as const;
  readonly [NATIVE_SUSPENSION] = true as const;

  constructor(readonly value: unknown) {
    super("Native execution suspended");
    this.name = "NativeSuspension";
  }
}

export function isNativeSuspension(value: unknown): value is NativeSuspension {
  return value instanceof NativeSuspension ||
    (isRecord(value) && value[NATIVE_SUSPENSION] === true && "value" in value);
}

/** Finds a suspension after an Effect runner has wrapped it in a Cause. */
export function findNativeSuspension(value: unknown): NativeSuspension | undefined {
  if (value instanceof NativeSuspension) return value;
  if (!Cause.isCause(value)) return undefined;
  for (const reason of value.reasons) {
    const inner = Cause.isFailReason(reason) || Cause.isDieReason(reason)
      ? Cause.isFailReason(reason) ? reason.error : reason.defect
      : undefined;
    const candidate = inner === undefined ? undefined : findNativeSuspension(inner);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

export function markNativeSuspension(cause: unknown): NativeSuspension {
  return new NativeSuspension(cause);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object";
}
