import { Cause, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";

const NATIVE_SUSPENSION = Symbol.for("relkit.native-suspension");

/** Provider-owned continuation value excluded from invocation outcomes.
 * @example new NativeSuspension({ token: "resume-later" });
 */
export class NativeSuspension extends Error {
  readonly code = "RELKIT_NATIVE_SUSPENSION" as const;
  readonly [NATIVE_SUSPENSION] = true as const;

  constructor(readonly value: unknown) {
    super("Native execution suspended");
    this.name = "NativeSuspension";
  }
}

/** Recognizes a native continuation through an Effect operation.
 * @param value - Candidate continuation value.
 * @returns Whether the value is marked as a continuation; no expected failure.
 * @example Effect.runSync(isNativeSuspensionEffect(new NativeSuspension(1)));
 */
export function isNativeSuspensionEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation(
    "suspension.is",
    Effect.sync(() => isSuspension(value)),
  );
}

/** Synchronous continuation type guard.
 * @param value - Candidate continuation value.
 * @returns Whether the value is a native continuation.
 * @example isNativeSuspension(new NativeSuspension(1));
 */
export function isNativeSuspension(value: unknown): value is NativeSuspension {
  return runInvocationSync(isNativeSuspensionEffect(value));
}

/** Finds a suspension inside a wrapped Effect Cause.
 * @param value - Candidate value or Cause.
 * @returns The first continuation, if any; no expected failure.
 * @example Effect.runSync(findNativeSuspensionEffect(new NativeSuspension(1)));
 */
export function findNativeSuspensionEffect(
  value: unknown,
): Effect.Effect<NativeSuspension | undefined> {
  return observeInvocation(
    "suspension.find",
    Effect.sync(() => findSuspension(value)),
  );
}

/** Synchronous Cause inspection adapter.
 * @param value - Candidate value or Cause.
 * @returns The first continuation, if any.
 * @example findNativeSuspension(new NativeSuspension(1));
 */
export function findNativeSuspension(value: unknown): NativeSuspension | undefined {
  return runInvocationSync(findNativeSuspensionEffect(value));
}

/** Wraps a provider continuation in an Effect operation.
 * @param cause - Provider continuation data.
 * @returns A marked continuation; no expected failure.
 * @example Effect.runSync(markNativeSuspensionEffect({ token: "later" }));
 */
export function markNativeSuspensionEffect(cause: unknown): Effect.Effect<NativeSuspension> {
  return observeInvocation(
    "suspension.mark",
    Effect.sync(() => new NativeSuspension(cause)),
  );
}

/** Synchronous provider continuation adapter.
 * @param cause - Provider continuation data.
 * @returns A marked continuation.
 * @example markNativeSuspension({ token: "later" });
 */
export function markNativeSuspension(cause: unknown): NativeSuspension {
  return runInvocationSync(markNativeSuspensionEffect(cause));
}

function isSuspension(value: unknown): boolean {
  return (
    value instanceof NativeSuspension ||
    (isRecord(value) && value[NATIVE_SUSPENSION] === true && "value" in value)
  );
}

function findSuspension(value: unknown): NativeSuspension | undefined {
  if (value instanceof NativeSuspension) return value;
  if (!Cause.isCause(value)) return undefined;
  for (const reason of value.reasons) {
    const inner =
      Cause.isFailReason(reason) || Cause.isDieReason(reason)
        ? Cause.isFailReason(reason)
          ? reason.error
          : reason.defect
        : undefined;
    const candidate = inner === undefined ? undefined : findSuspension(inner);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object";
}
