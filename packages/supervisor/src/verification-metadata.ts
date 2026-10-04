import { API_VERSION, GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import { CandidateVerificationError } from "./verification-error.js";
import type { CandidateProbeResponse, CandidateVerificationOptions } from "./verification.types.js";
import type {
  CandidateGraphMetadata,
  CandidateReadinessState,
} from "./verification-metadata.types.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";

/** Validates the selective native internal-API envelope. @param probe - Native response and payload. */
export function assertEnvelope(probe: CandidateProbeResponse): void {
  if (
    probe.payload.protocol !== "relkit.inspector" ||
    probe.payload.version !== API_VERSION ||
    (probe.response.headers.get("x-relkit-api-version") ?? String(API_VERSION)) !==
      String(API_VERSION)
  )
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_API_VERSION_UNSUPPORTED",
      "Candidate does not expose the supported v1 internal API.",
    );
}

/** Verifies reported generation witnesses. @param payload - Selectively read health metadata.
 * @param expected - Compiled generation identity. @returns False only for the existing absent-identity case. */
export function verifyIdentity(
  payload: Record<string, unknown>,
  expected: SupervisorCandidateToken,
): boolean {
  const sourceToken = payload.sourceToken;
  const generationToken = payload.generationToken;
  if (sourceToken === undefined && generationToken === undefined) return false;
  if (sourceToken !== expected.sourceToken || generationToken !== expected.generationToken)
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_GENERATION_MISMATCH",
      "Candidate health responses identify a different generation.",
    );
  return true;
}

/** Checks graph/manifest/hash cohort compatibility. @param payload - Selective internal metadata.
 * @param options - Expected compiled versions and fingerprint. @returns Original admitted graph metadata. */
export function verifyGraph(
  payload: Record<string, unknown>,
  options: CandidateVerificationOptions,
): CandidateGraphMetadata {
  const graphHash = stringValue(payload.graphHash);
  const manifestGraphHash = stringValue(payload.manifestGraphHash ?? payload.manifestHash);
  if (
    graphHash !== options.activationFingerprint.graphHash ||
    manifestGraphHash !== options.activationFingerprint.graphHash
  )
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_GRAPH_HASH_MISMATCH",
      "Candidate graph and manifest hashes do not match the expected graph.",
    );
  if (graphHash !== manifestGraphHash)
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_GRAPH_HASH_MISMATCH",
      "Candidate graph and manifest hashes differ.",
    );
  const graphContractVersion = numberValue(payload.graphContractVersion ?? payload.graphVersion);
  const manifestContractVersion = numberValue(
    payload.manifestContractVersion ?? payload.manifestVersion,
  );
  const manifestGeneratorVersion = numberValue(
    payload.manifestGeneratorVersion ?? payload.generatorVersion,
  );
  if (
    graphContractVersion === undefined ||
    graphContractVersion !== (options.graphContractVersion ?? GRAPH_VERSION)
  )
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_GRAPH_VERSION_UNSUPPORTED",
      `Candidate graph contract version ${String(graphContractVersion)} is unsupported; rebuild the candidate with graph v${options.graphContractVersion ?? GRAPH_VERSION}.`,
    );
  if (
    manifestContractVersion === undefined ||
    manifestContractVersion !== (options.manifestContractVersion ?? MANIFEST_VERSION)
  )
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_MANIFEST_VERSION_UNSUPPORTED",
      `Candidate manifest contract version ${String(manifestContractVersion)} is unsupported; rebuild the candidate with manifest v${options.manifestContractVersion ?? MANIFEST_VERSION}.`,
    );
  if (
    manifestGeneratorVersion === undefined ||
    manifestGeneratorVersion !== (options.manifestGeneratorVersion ?? GENERATOR_VERSION)
  )
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_GENERATOR_VERSION_UNSUPPORTED",
      `Candidate manifest generator version ${String(manifestGeneratorVersion)} is unsupported; rebuild the candidate with generator v${options.manifestGeneratorVersion ?? GENERATOR_VERSION}.`,
    );
  return {
    graphHash,
    manifestGraphHash,
    graphContractVersion,
    manifestContractVersion,
    manifestGeneratorVersion,
  };
}

/** Admits established readiness aliases selectively. @param payload - Internal health metadata.
 * @returns Environment/provider flags or the existing response-invalid error. */
export function readinessState(payload: Record<string, unknown>): CandidateReadinessState {
  const environmentReady = readinessValue(payload.environmentReady ?? payload.environment);
  const providerReady = readinessValue(
    payload.providerReady ?? payload.providersReady ?? payload.providers,
  );
  if (environmentReady === undefined || providerReady === undefined)
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_RESPONSE_INVALID",
      "Candidate readiness did not report environment and provider status.",
    );
  return { environmentReady, providerReady };
}

/** Admits a readiness primitive/record. @param value - Selected native field.
 * @returns Boolean only for the existing supported shapes. */
function readinessValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return isRecord(value) && typeof value.ready === "boolean" ? value.ready : undefined;
}

/** Admits a required hash string. @param value - Selected native field. @returns Valid hash text. */
function stringValue(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_RESPONSE_INVALID",
      "Candidate health metadata contains an invalid hash.",
    );
  return value;
}

/** Admits safe integer version metadata. @param value - Selected native field.
 * @returns Version or undefined, preserving later specific compatibility classification. */
function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

/** Narrows selective metadata. @param value - Native field. @returns Whether it is a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Constructs the existing health deadline error. @returns Public timeout code/message. */
export function timeoutError(): CandidateVerificationError {
  return new CandidateVerificationError(
    "RELKIT_CANDIDATE_HEALTH_TIMEOUT",
    "Candidate health checks did not complete before the timeout.",
  );
}
