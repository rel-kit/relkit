import { Clock, Effect } from "effect";
import { CandidateVerificationError } from "./verification-error.js";
import type { CandidateProbeResponse, CandidateVerificationOptions } from "./verification.types.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import { requestProbe } from "./verification-http.js";
import { rejectVerification, validateVerification } from "./verification-errors.js";
import { assertEnvelope, readinessState, timeoutError } from "./verification-metadata.js";
export {
  assertEnvelope,
  verifyIdentity,
  verifyGraph,
  readinessState,
} from "./verification-metadata.js";

/** Requires an available supported envelope before graph verification.
 * @param options - Candidate options. @param path - Endpoint.
 * @param deadline - Shared injected-clock deadline. @param fetcher - Native platform boundary.
 * @returns A valid supported response, preserving existing public failures.
 */
export function requiredProbe(
  options: CandidateVerificationOptions,
  path: string,
  deadline: number,
  fetcher: typeof fetch,
): Effect.Effect<CandidateProbeResponse, unknown> {
  return Effect.gen(function* () {
    const probe = yield* requestProbe(options, path, deadline, fetcher);
    if (probe === undefined) return yield* rejectVerification(timeoutError());
    yield* validateVerification(() => assertEnvelope(probe));
    if (!probe.response.ok)
      return yield* rejectVerification(
        new CandidateVerificationError(
          "RELKIT_CANDIDATE_API_VERSION_UNSUPPORTED",
          "Candidate does not expose the required internal endpoint.",
        ),
      );
    return probe;
  });
}

/**
 * Polls idempotent health reads at most every ten milliseconds under one absolute deadline.
 * @param options - Candidate options. @param path - Readiness endpoint.
 * @param deadline - Shared injected-clock deadline. @param accepts - Valid ready-state predicate.
 * @param fetcher - Native platform boundary.
 * @returns Accepted health or the original specific readiness/timeout error.
 */
export function pollHealth(
  options: CandidateVerificationOptions,
  path: "/health/live" | "/health/ready",
  deadline: number,
  accepts: (probe: CandidateProbeResponse) => boolean,
  fetcher: typeof fetch,
): Effect.Effect<CandidateProbeResponse, unknown> {
  return Effect.gen(function* () {
    let last: CandidateProbeResponse | undefined;
    while ((yield* Clock.currentTimeMillis) < deadline) {
      const probe = yield* requestProbe(options, path, deadline, fetcher);
      if (probe !== undefined) {
        yield* validateVerification(() => assertEnvelope(probe));
        last = probe;
        if (yield* validateVerification(() => accepts(probe))) return probe;
      }
      const remaining = deadline - (yield* Clock.currentTimeMillis);
      if (remaining > 0) yield* Effect.sleep(Math.min(10, remaining));
    }
    if (path === "/health/ready" && last !== undefined) {
      const readiness = yield* validateVerification(() => readinessState(last!.payload));
      if (!readiness.environmentReady)
        return yield* rejectVerification(
          new CandidateVerificationError(
            "RELKIT_CANDIDATE_ENVIRONMENT_NOT_READY",
            "Candidate environment is not ready.",
          ),
        );
      if (!readiness.providerReady)
        return yield* rejectVerification(
          new CandidateVerificationError(
            "RELKIT_CANDIDATE_PROVIDER_NOT_READY",
            "Candidate providers are not ready.",
          ),
        );
    }
    return yield* rejectVerification(timeoutError());
  });
}
