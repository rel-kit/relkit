import { isStableIdEffect } from "@relkit/contracts";
import { Effect } from "effect";
import {
  failValidation,
  runValidation,
  validationEffect,
  type GraphValidationError,
} from "./graph-validation-error.js";
import { observeGraph, runGraph } from "./graph-observability.js";
/**
 * Checks for a stable graph ID without the reserved unbound prefix.
 * @param value - Candidate graph identity.
 * @returns An Effect containing the boolean result; it has no expected failure.
 * @example Effect.runSync(isCanonicalIdEffect("orders.get"));
 */
export function isCanonicalIdEffect(value: unknown): Effect.Effect<boolean> {
  return observeGraph(
    "validation.is-canonical-id",
    Effect.map(
      isStableIdEffect(value),
      (stable) => stable && typeof value === "string" && !value.startsWith("unbound."),
    ),
  );
}
/**
 * Synchronous compatibility adapter for canonical graph ID detection.
 * @param value - Candidate graph identity.
 * @returns Whether the value is a canonical graph ID.
 * @example isCanonicalId("orders.get");
 */
export function isCanonicalId(value: unknown): value is string {
  return runGraph(isCanonicalIdEffect(value));
}
/**
 * Validates a canonical graph identity with a field-specific error.
 * @param value - Candidate graph identity.
 * @param label - Field label for the failure message.
 * @returns An Effect that succeeds with void or fails with GraphValidationError.
 * @example Effect.runSync(validateIdEffect("orders.get", "Graph appId"));
 */
export function validateIdEffect(
  value: unknown,
  label: string,
): Effect.Effect<void, GraphValidationError> {
  return validationEffect("validation.id", () => {
    if (!isCanonicalId(value)) failValidation(`${label} is invalid.`);
  });
}
/**
 * Synchronous compatibility adapter for canonical graph ID validation.
 * @param value - Candidate graph identity.
 * @param label - Field label for the failure message.
 * @returns Void for a valid ID.
 * @throws TypeError for an invalid ID.
 * @example validateId("orders.get", "Graph appId");
 */
export function validateId(value: unknown, label: string): void {
  return runValidation(validateIdEffect(value, label));
}
/**
 * Checks for a nonempty text value after trimming.
 * @param value - Candidate text.
 * @returns An Effect containing the boolean result; it has no expected failure.
 * @example Effect.runSync(nonEmptyEffect("orders"));
 */
export function nonEmptyEffect(value: unknown): Effect.Effect<boolean> {
  return observeGraph(
    "validation.non-empty",
    Effect.sync(() => typeof value === "string" && value.trim().length > 0),
  );
}
/**
 * Synchronous compatibility adapter for nonempty text detection.
 * @param value - Candidate text.
 * @returns Whether text remains after trimming.
 * @example nonEmpty("orders");
 */
export function nonEmpty(value: unknown): value is string {
  return runGraph(nonEmptyEffect(value));
}
/**
 * Checks for a non-array object during graph validation.
 * @param value - Candidate graph value.
 * @returns Whether the value is a record.
 * @example isRecord({ kind: "app" });
 */
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
