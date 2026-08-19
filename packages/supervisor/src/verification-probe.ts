import { API_VERSION, GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import {
  CandidateVerificationError,
  type CandidateProbeResponse,
  type CandidateVerificationOptions,
  type CandidateVerificationResult,
} from "./verification-types.js";
import type { SupervisorCandidateToken } from "./state-machine-types.js";
import { requestProbe } from "./verification-http.js";

export async function requiredProbe(
  options: CandidateVerificationOptions,
  path: string,
  deadline: number,
): Promise<CandidateProbeResponse> {
  const probe = await requestProbe(options, path, deadline);
  if (probe === undefined) throw timeoutError();
  assertEnvelope(probe);
  if (!probe.response.ok)
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_API_VERSION_UNSUPPORTED",
      "Candidate does not expose the required internal endpoint.",
    );
  return probe;
}

export async function pollHealth(
  options: CandidateVerificationOptions,
  path: "/health/live" | "/health/ready",
  deadline: number,
  accepts: (probe: CandidateProbeResponse) => boolean,
): Promise<CandidateProbeResponse> {
  let last: CandidateProbeResponse | undefined;
  while (Date.now() < deadline) {
    const probe = await requestProbe(options, path, deadline);
    if (probe !== undefined) {
      assertEnvelope(probe);
      last = probe;
      if (accepts(probe)) return probe;
    }
    await delay(Math.min(10, Math.max(1, deadline - Date.now())));
  }
  if (path === "/health/ready" && last !== undefined) {
    const readiness = readinessState(last.payload);
    if (!readiness.environmentReady)
      throw new CandidateVerificationError(
        "ZSYS_CANDIDATE_ENVIRONMENT_NOT_READY",
        "Candidate environment is not ready.",
      );
    if (!readiness.providerReady)
      throw new CandidateVerificationError(
        "ZSYS_CANDIDATE_PROVIDER_NOT_READY",
        "Candidate providers are not ready.",
      );
  }
  throw timeoutError();
}

export function assertEnvelope(probe: CandidateProbeResponse): void {
  if (
    probe.payload.protocol !== "zsys.inspector" ||
    probe.payload.version !== API_VERSION ||
    (probe.response.headers.get("x-zsys-api-version") ?? String(API_VERSION)) !==
      String(API_VERSION)
  )
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_API_VERSION_UNSUPPORTED",
      "Candidate does not expose the supported v1 internal API.",
    );
}

export function verifyIdentity(
  payload: Record<string, unknown>,
  expected: SupervisorCandidateToken,
): boolean {
  const sourceToken = payload.sourceToken;
  const generationToken = payload.generationToken;
  if (sourceToken === undefined && generationToken === undefined) return false;
  if (sourceToken !== expected.sourceToken || generationToken !== expected.generationToken)
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_GENERATION_MISMATCH",
      "Candidate health responses identify a different generation.",
    );
  return true;
}

export function verifyGraph(
  payload: Record<string, unknown>,
  options: CandidateVerificationOptions,
): Omit<
  CandidateVerificationResult,
  "token" | "apiVersion" | "environmentReady" | "providerReady"
> {
  const graphHash = stringValue(payload.graphHash);
  const manifestGraphHash = stringValue(payload.manifestGraphHash ?? payload.manifestHash);
  if (graphHash !== options.graphHash || manifestGraphHash !== options.graphHash)
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_GRAPH_HASH_MISMATCH",
      "Candidate graph and manifest hashes do not match the expected graph.",
    );
  if (graphHash !== manifestGraphHash)
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_GRAPH_HASH_MISMATCH",
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
      "ZSYS_CANDIDATE_GRAPH_VERSION_UNSUPPORTED",
      "Candidate graph contract version is unsupported.",
    );
  if (
    manifestContractVersion === undefined ||
    manifestContractVersion !== (options.manifestContractVersion ?? MANIFEST_VERSION)
  )
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_MANIFEST_VERSION_UNSUPPORTED",
      "Candidate manifest contract version is unsupported.",
    );
  if (
    manifestGeneratorVersion === undefined ||
    manifestGeneratorVersion !== (options.manifestGeneratorVersion ?? GENERATOR_VERSION)
  )
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_GENERATOR_VERSION_UNSUPPORTED",
      "Candidate manifest generator version is unsupported.",
    );
  return {
    graphHash,
    manifestGraphHash,
    graphContractVersion,
    manifestContractVersion,
    manifestGeneratorVersion,
  };
}

export function readinessState(payload: Record<string, unknown>): {
  readonly environmentReady: boolean;
  readonly providerReady: boolean;
} {
  const environmentReady = readinessValue(payload.environmentReady ?? payload.environment);
  const providerReady = readinessValue(
    payload.providerReady ?? payload.providersReady ?? payload.providers,
  );
  if (environmentReady === undefined || providerReady === undefined)
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_RESPONSE_INVALID",
      "Candidate readiness did not report environment and provider status.",
    );
  return { environmentReady, providerReady };
}

function readinessValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return isRecord(value) && typeof value.ready === "boolean" ? value.ready : undefined;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new CandidateVerificationError(
      "ZSYS_CANDIDATE_RESPONSE_INVALID",
      "Candidate health metadata contains an invalid hash.",
    );
  return value;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timeoutError(): CandidateVerificationError {
  return new CandidateVerificationError(
    "ZSYS_CANDIDATE_HEALTH_TIMEOUT",
    "Candidate health checks did not complete before the timeout.",
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
