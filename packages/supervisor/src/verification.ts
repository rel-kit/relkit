import { Cause, Effect, Exit, Layer, ManagedRuntime, Metric } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import {
  CandidateVerification,
  createVerificationLayer,
  VerificationPlatformLive,
} from "./verification-service.js";
import { VerificationFailure } from "./verification.schemas.js";
import type {
  CandidateVerificationOptions,
  CandidateVerificationResult,
} from "./verification.types.js";
export type * from "./verification.types.js";
export { CandidateVerificationError } from "./verification-error.js";
export { DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS } from "./verification-data.js";

/**
 * Verifies readiness and identity before the synchronous activation edge can switch traffic.
 * @param options - Candidate, expected identity and explicit native dependencies.
 * @returns Accepted candidate identity; failure releases only this candidate.
 * @example
 * ```ts
 * import { verifyCandidate } from "@relkit/supervisor";
 * import type { CandidateVerificationOptions } from "@relkit/supervisor";
 * export async function verify(options: CandidateVerificationOptions): Promise<void> {
 *   const verified = await verifyCandidate(options);
 *   console.log(verified.token.generationToken);
 * }
 * ```
 */
export async function verifyCandidate(
  options: CandidateVerificationOptions,
): Promise<CandidateVerificationResult> {
  const owner = ManagedRuntime.make(
    Layer.mergeAll(
      createVerificationLayer(options).pipe(Layer.provide(VerificationPlatformLive)),
      createLoggerLayer({ component: "supervisor", ...options.logger }),
      Layer.succeed(Metric.MetricRegistry, new Map()),
    ),
  );
  try {
    const exit = await owner.runPromiseExit(
      Effect.flatMap(CandidateVerification, (service) => service.verify).pipe(
        Effect.mapError((error) => (error instanceof VerificationFailure ? error.error : error)),
      ),
      options.signal === undefined ? undefined : { signal: options.signal },
    );
    if (Exit.isSuccess(exit)) return exit.value;
    if (options.signal?.aborted && Cause.hasInterruptsOnly(exit.cause))
      throw options.signal.reason ?? new Error("Verification was aborted.");
    throw Cause.squash(exit.cause);
  } finally {
    await owner.dispose();
  }
}
