import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { JobWatchAbortedError } from "./types.js";
import type { Procedure } from "./reconcile.types.js";

/**
 * Resolves a generated job procedure or preserves the existing missing-procedure error.
 * @param root - Existing root used for lookup or configuration.
 * @param name - Declared resource or selector identity.
 * @param operation - One native boundary operation.
 * @returns The declared native job procedure.
 */
export function resolveJobProcedure(root: unknown, name: string, operation: string): Procedure {
  const value = descend(root, ["jobs", name, "runs", operation]);
  if (typeof value !== "function") {
    throw new TypeError(`Unknown Relkit job procedure "jobs.${name}.runs.${operation}"`);
  }
  return value as Procedure;
}

/**
 * Finds a concrete job procedure while avoiding synthesized proxy properties.
 * @param root - Existing root used for lookup or configuration.
 * @param name - Declared resource or selector identity.
 * @param operation - One native boundary operation.
 * @returns An own callable procedure, or undefined.
 */
export function ownJobProcedure(
  root: unknown,
  name: string,
  operation: string,
): Procedure | undefined {
  let value: unknown = root;
  for (const key of ["jobs", name, "runs", operation]) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = value[key];
  }
  return typeof value === "function" ? (value as Procedure) : undefined;
}

/**
 * Resolves each explicit path component without rewriting dotted property semantics.
 * @param root - Existing root used for lookup or configuration.
 * @param path - Explicit lookup path components.
 * @returns The explicit nested value, or undefined when traversal is unavailable.
 */
function descend(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
    if (value === undefined) return undefined;
  }
  return value;
}

/**
 * Resolves an optional generated procedure while preserving unrelated lookup defects.
 * @param root - Existing root used for lookup or configuration.
 * @param name - Declared resource or selector identity.
 * @param operation - One native boundary operation.
 * @returns The procedure, or undefined only for a missing generated path.
 */
export function optionalJobProcedure(
  root: unknown,
  name: string,
  operation: string,
): Procedure | undefined {
  try {
    return resolveJobProcedure(root, name, operation);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("Unknown Relkit job procedure"))
      return undefined;
    throw error;
  }
}

/**
 * Recognizes the existing missing-procedure envelope used for safe read fallback.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether the native failure declares NOT_FOUND.
 */
export function isProcedureNotFound(value: unknown): boolean {
  return isRecord(value) && value.code === "NOT_FOUND";
}

/**
 * Checks and transfers a native iterable or iterator without cloning its payloads.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The original iterator or the iterable's native iterator.
 */
export function toAsyncIterator(value: unknown): AsyncIterator<unknown> {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const candidate = value as {
      readonly [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
      readonly next?: (...args: readonly unknown[]) => Promise<IteratorResult<unknown>>;
    };
    const asyncIterator = candidate[Symbol.asyncIterator];
    if (typeof asyncIterator === "function") return asyncIterator();
    if (typeof candidate.next === "function") return candidate as AsyncIterator<unknown>;
  }
  throw new TypeError("Job watch procedure did not return an async iterator.");
}

/**
 * Checks the existing selective watch-frame envelope and retains original fields.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The checked original observation frame.
 */
export function asWatchFrame(value: unknown): RunWatchFrame {
  if (!isRecord(value) || typeof value.kind !== "string" || !isRecord(value.run)) {
    throw new TypeError("Job watch returned an invalid observation frame.");
  }
  return value as unknown as RunWatchFrame;
}

/**
 * Checks the existing selective run-snapshot authority without stricter payload validation.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether the selective run identity and status shape is valid.
 */
export function isRunSnapshot(value: unknown): value is RunSnapshot {
  return isRecord(value) && typeof value.runId === "string" && typeof value.status === "string";
}

/**
 * Preserves the public watch-aborted failure at a native compatibility edge.
 * @param signal - Borrowed caller cancellation signal.
 * @returns Nothing; the existing owned state or publication is updated.
 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new JobWatchAbortedError();
}

/**
 * Checks whether the existing property-access boundary accepts a supplied value.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether property access is valid for this boundary.
 */
function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
