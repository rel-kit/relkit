import type { RuntimeActivationFingerprint } from "@relkit/contracts";
import type { DiagnosticRecord, GenerationRecord } from "@relkit/observability";
import type { SupervisorCandidateToken } from "./state-machine.types.js";

/** Selective lifecycle output with the existing SSE topic. */
export interface SupervisorTelemetryRecord {
  readonly record: GenerationRecord | DiagnosticRecord;
  readonly streamType: "generation.changed" | "diagnostic.changed";
}

/** Resolves a fingerprint only for the explicitly selected generation. */
export type SupervisorFingerprintResolver = (
  token: SupervisorCandidateToken,
) => RuntimeActivationFingerprint;
