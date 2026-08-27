import { API_VERSION } from "@relkit/contracts";
import {
  pollHealth,
  readinessState,
  requiredProbe,
  verifyGraph,
  verifyIdentity,
} from "./verification-probe.js";
import {
  CandidateVerificationError,
  DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS,
  type CandidateVerificationOptions,
  type CandidateVerificationResult,
} from "./verification-types.js";

export * from "./verification-types.js";

/** Verifies a started candidate before the state machine is allowed to switch it in. */
export async function verifyCandidate(
  options: CandidateVerificationOptions,
): Promise<CandidateVerificationResult> {
  const timeout = options.healthTimeoutMs ?? DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS;
  validateOptions(options, timeout);
  const deadline = Date.now() + timeout;
  let identitySeen = false;
  try {
    const live = await pollHealth(options, "/health/live", deadline, (probe) => {
      identitySeen ||= verifyIdentity(probe.payload, options.candidate.token);
      return probe.response.ok && probe.payload.status === "ok";
    });
    identitySeen ||= verifyIdentity(live.payload, options.candidate.token);

    const graph = await requiredProbe(options, "/graph", deadline);
    identitySeen ||= verifyIdentity(graph.payload, options.candidate.token);
    const graphValues = verifyGraph(graph.payload, options);

    const ready = await pollHealth(options, "/health/ready", deadline, (probe) => {
      identitySeen ||= verifyIdentity(probe.payload, options.candidate.token);
      const readiness = readinessState(probe.payload);
      return (
        probe.response.ok &&
        probe.payload.status === "ready" &&
        readiness.environmentReady &&
        readiness.providerReady
      );
    });
    identitySeen ||= verifyIdentity(ready.payload, options.candidate.token);
    if (!identitySeen)
      throw new CandidateVerificationError(
        "RELKIT_CANDIDATE_RESPONSE_INVALID",
        "Candidate health responses did not identify their generation.",
      );
    return Object.freeze({
      token: options.candidate.token,
      ...graphValues,
      apiVersion: API_VERSION,
      environmentReady: true,
      providerReady: true,
    });
  } catch (error) {
    await options.candidate.dispose?.().catch(() => undefined);
    throw error;
  }
}

function validateOptions(options: CandidateVerificationOptions, timeout: number): void {
  if (!Number.isSafeInteger(options.candidate.port) || options.candidate.port < 1)
    throw new TypeError("Candidate verification requires a valid backend port.");
  if (options.graphHash.trim() === "") throw new TypeError("Candidate graph hash is required.");
  if (!Number.isSafeInteger(timeout) || timeout < 1)
    throw new RangeError("healthTimeoutMs must be a positive safe integer.");
  if (options.signal?.aborted)
    throw options.signal.reason ?? new Error("Verification was aborted.");
}
