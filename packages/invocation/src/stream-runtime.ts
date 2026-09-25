import { Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { StreamOutput } from "./stream-runtime.types.js";

export type { StreamOutput } from "./stream-runtime.types.js";
export * from "./stream-errors.js";
export * from "./lazy-stream.js";
export * from "./managed-stream.js";

/** Recognizes a Standard Schema stream output descriptor through Effect.
 * @param value - Candidate output descriptor.
 * @returns Whether the value declares a stream; no expected failure.
 * @example Effect.runSync(isStreamOutputEffect({ kind: "stream", item: schema }));
 */
export function isStreamOutputEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation(
    "stream.is-output",
    Effect.sync(() => isRecord(value) && value.kind === "stream" && isRecord(value.item)),
  );
}

/** Synchronous stream output descriptor guard.
 * @param value - Candidate output descriptor.
 * @returns Whether the value declares a stream.
 * @example isStreamOutput({ kind: "stream", item: schema });
 */
export function isStreamOutput(value: unknown): value is StreamOutput {
  return runInvocationSync(isStreamOutputEffect(value));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object";
}
