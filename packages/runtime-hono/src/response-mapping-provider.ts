import { toFailureTelemetry, type InvocationFailure } from "@relkit/runtime-effect";
import type { ResponseMode } from "./response-mapping.types.js";

/** Exposes a sanitized provider message only in development mode.
 * @param failure - Normalized invocation failure whose private cause may contain provider diagnostics.
 * @param mode - Configured runtime exposure or response-validation mode.
 * @returns The sanitized provider cause message in development, otherwise undefined.
 */
export function developmentProviderMessage(
  failure: InvocationFailure,
  mode: ResponseMode | undefined,
): string | undefined {
  if (failure.kind !== "provider" || mode !== "development") return undefined;
  const cause = toFailureTelemetry(failure, { mode: "development" }).internal?.cause;
  if (cause === null || typeof cause !== "object" || !("message" in cause)) return undefined;
  return typeof cause.message === "string" ? cause.message : undefined;
}
