import { createTestIdentitySource } from "./identity.js";
import type { InvocationIdSource } from "relkit/engine";
import type { TestFailureControls } from "./fakes.js";

/**
 * Creates an isolated monotonically sequenced invocation identity source.
 * @returns A source emitting native trace, span and invocation identity formats.
 */
export function createIdSource(): InvocationIdSource {
  return createTestIdentitySource();
}

/**
 * Creates deterministic retry randomness with upfront fixture validation.
 * @param source - Caller-supplied randomness source, when present.
 * @param values - Finite retry random values in the interval [0, 1).
 * @returns The caller's source or a sequence-backed source defaulting to 0.5.
 */
export function createRandom(
  source: (() => number) | undefined,
  values: readonly number[] | undefined,
) {
  if (source !== undefined) return source;
  const sequence = values?.map((value) => {
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new TypeError("Test job randomness must be in [0, 1)");
    return value;
  });
  let index = 0;
  return () => sequence?.[index++] ?? 0.5;
}

/**
 * Creates isolated named failure injection controls.
 * @returns Controls retaining configured failures and consuming one-shot boundaries once.
 */
export function createFailures(): TestFailureControls {
  const configured = new Map<string, { readonly cause: unknown; readonly once: boolean }>();
  return Object.freeze({
    failAt: (point: string, cause?: unknown) => set(point, cause, false),
    once: (point: string, cause?: unknown) => set(point, cause, true),
    clear: (point?: string) =>
      point === undefined ? configured.clear() : configured.delete(point),
    check: (point: string) => {
      const failure = configured.get(point);
      if (failure === undefined) return;
      if (failure.once) configured.delete(point);
      throw failure.cause instanceof Error
        ? failure.cause
        : new Error(`Injected test failure: ${point}`);
    },
  });

  /**
   * Registers a named injected failure and its consumption policy.
   * @param point - Named failure boundary used by the owning workflow.
   * @param cause - Original caller-supplied failure value.
   * @param once - Whether the configured failure is consumed on its first check.
   * @returns Nothing; the owner-local failure registry stores the declaration.
   */
  function set(point: string, cause: unknown, once: boolean): void {
    if (point.trim() === "") throw new TypeError("Failure point must not be empty");
    configured.set(point, { cause: cause ?? new Error(`Injected test failure: ${point}`), once });
  }
}
