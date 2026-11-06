import { toFailureTelemetry, type InvocationFailure } from "../runtime-effect/index.js";
import type { ResponseMode } from "./response-mapping.types.js";

/** Exposes a sanitized provider or defect message only in development mode, so a local
 * `internal-error` names its cause instead of hiding it.
 * @param failure - Normalized invocation failure whose private cause may contain diagnostics.
 * @param mode - Configured runtime exposure or response-validation mode.
 * @returns The sanitized cause message in development, otherwise undefined.
 */
export function developmentFailureMessage(
  failure: InvocationFailure,
  mode: ResponseMode | undefined,
): string | undefined {
  if ((failure.kind !== "provider" && failure.kind !== "defect") || mode !== "development")
    return undefined;
  const cause = toFailureTelemetry(failure, { mode: "development" }).internal?.cause;
  if (cause === null || typeof cause !== "object" || !("message" in cause)) return undefined;
  return typeof cause.message === "string" ? cause.message : undefined;
}
