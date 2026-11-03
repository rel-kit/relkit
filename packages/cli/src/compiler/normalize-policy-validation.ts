import { add } from "./normalize-pass-support.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { id, isRecord, text, positive } from "./normalize-utils.js";

/**
 * Checks retry attempts, delays, and backoff bounds.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param value - Declared metadata to inspect without coercion.
 * @param required - Declared required for the validation.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateRetryEffect = Effect.fn("Compiler.validateRetry")(
  function* (
    work: NormalizationWork,
    descriptor: NormalizedDescriptor,
    value: Record<string, any>,
    required = false,
  ) {
    if (!isRecord(value.retry)) {
      if (required) add(work, descriptor, NORMALIZE_CODES.retry, "Retry policy is required.");
      return;
    }
    const multiplier = value.retry.multiplier;
    if (
      !positive(value.retry.maxAttempts) ||
      typeof multiplier !== "number" ||
      !Number.isFinite(multiplier) ||
      multiplier < 1 ||
      !["none", "full", "equal"].includes(value.retry.jitter) ||
      !Number.isSafeInteger(value.retry.initialDelayMs) ||
      !Number.isSafeInteger(value.retry.maxDelayMs) ||
      value.retry.initialDelayMs < 0 ||
      value.retry.maxDelayMs < value.retry.initialDelayMs
    )
      add(work, descriptor, NORMALIZE_CODES.retry, "Retry policy is invalid.");
  },
  (effect, work, descriptor, value, required = false) =>
    observeCompiler("normalization", "validateRetry", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks retry attempts, delays, and backoff bounds.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param value - Declared metadata to inspect without coercion.
 * @param required - Declared required for the validation.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateRetry(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: Record<string, any>,
  required = false,
): void {
  return runCompilerSync(validateRetryEffect(work, descriptor, value, required));
}

/**
 * Applies normalized retry policy fields and defaults.
 * @param value - Declared metadata inspected without coercion.
 * @returns Normalized retry fields with legacy-compatible defaults.
 */
export function normalizeRetry(value: Record<string, any>): Record<string, any> {
  return {
    ...value,
    jitter: typeof value.jitter === "string" ? value.jitter.trim().toLowerCase() : value.jitter,
  };
}

/**
 * Normalizes a declared schedule's primitive metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns Normalized schedule metadata, retaining unsupported values for validation.
 */
export function normalizeSchedule(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    id: id(value.id) ?? text(value.id) ?? value.id,
    cron: typeof value.cron === "string" ? value.cron.trim().replace(/\s+/g, " ") : value.cron,
    timezone: text(value.timezone) ?? value.timezone,
  };
}
