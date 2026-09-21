import { canonicalJson } from "@relkit/contracts";
import type { JsonValue } from "@relkit/contracts";
import { isEvaluatorResponse } from "./evaluator-protocol-validation.js";
export { isEvaluatorRequest, isEvaluatorResponse } from "./evaluator-protocol-validation.js";

export const EVALUATOR_PROTOCOL = "relkit.evaluator" as const;
export const EVALUATOR_PROTOCOL_VERSION = 1 as const;
export const EVALUATOR_FRAME = "\u001erelkit-evaluator-response:";

export type EvaluatorFailureCode =
  | "RELKIT_EVALUATOR_REQUEST_INVALID"
  | "RELKIT_EVALUATOR_ROOT_INVALID"
  | "RELKIT_EVALUATOR_IMPORT_FAILED"
  | "RELKIT_EVALUATOR_TIMEOUT"
  | "RELKIT_EVALUATOR_PROCESS_FAILED"
  | "RELKIT_EVALUATOR_PROTOCOL_INVALID"
  | "RELKIT_EVALUATOR_SIDE_EFFECT";

export type EvaluatorSideEffectKind =
  | "listening-socket"
  | "live-timer"
  | "write-outside-generated-sandbox"
  | "child-process"
  | "direct-output"
  | "unapproved-network";

export interface EvaluatorSideEffect {
  readonly kind: EvaluatorSideEffectKind;
  readonly operation: string;
  readonly target: string;
}

/**
 * Coverage is deliberately explicit: these hooks are fault detectors, not a
 * security sandbox. Unsupported bypasses still run inside the killed child.
 */
export const EVALUATOR_DETECTOR_COVERAGE = Object.freeze({
  supported: Object.freeze([
    "Bun and common Node socket/process/network entry points",
    "global timers and direct stdout/stderr writes",
    "common Node fs mutators and Bun.write",
  ]),
  unsupported: Object.freeze([
    "native syscalls and APIs that bypass the patched entry points",
    "pre-bound named imports from CommonJS built-ins",
    "file-descriptor writes and filesystem symlink/race escapes",
    "effects scheduled after evaluation returns or outside the child process",
  ]),
});

export interface EvaluatorDetectorCoverage {
  readonly supported: readonly string[];
  readonly unsupported: readonly string[];
}

export interface EvaluatorCandidate {
  readonly file: string;
}

export interface EvaluatorRequest {
  readonly protocol: typeof EVALUATOR_PROTOCOL;
  readonly version: typeof EVALUATOR_PROTOCOL_VERSION;
  readonly generationId: string;
  readonly projectRoot: string;
  readonly candidates: readonly EvaluatorCandidate[];
  readonly environmentAllowlist: readonly string[];
  readonly generatedDirectory: string;
  readonly networkAllowlist: readonly string[];
  readonly sourceMaps: boolean;
  readonly timeoutMs: number;
}

export interface EvaluatorManifestReference {
  readonly generationId: string;
  readonly descriptorId: string;
  readonly kind: string;
  readonly module: string;
  readonly exportName: string;
}

/** Data-only schema provenance carried across the evaluator process boundary. */
export interface EvaluatorSchemaSnapshot {
  readonly $relkit: "schema" | "schema-unavailable";
  readonly jsonSchema?: JsonValue;
  readonly inputJsonSchema?: JsonValue;
  readonly outputJsonSchema?: JsonValue;
  readonly contractHash?: string;
  readonly transformed?: boolean;
  readonly refined?: boolean;
  readonly reason?: string;
}

export interface EvaluatorDescriptorSnapshot {
  readonly kind: string;
  readonly id: string;
  readonly ref: { readonly kind: string; readonly id: string };
  readonly metadata: JsonValue;
}

export interface EvaluatorExportSnapshot {
  readonly exportName: string;
  readonly descriptor: EvaluatorDescriptorSnapshot;
}

export interface EvaluatorModuleResult {
  readonly file: string;
  readonly exports: readonly EvaluatorExportSnapshot[];
  readonly manifestReferences: readonly EvaluatorManifestReference[];
}

export interface EvaluatorFailure {
  readonly code: EvaluatorFailureCode;
  readonly message: string;
  readonly generationId: string;
  readonly module?: string;
  readonly stack?: string;
  readonly sideEffects?: readonly EvaluatorSideEffect[];
  readonly exitCode?: number;
  readonly timedOut?: boolean;
  readonly stdout?: string;
  readonly stderr?: string;
}

export interface EvaluatorResponse {
  readonly protocol: typeof EVALUATOR_PROTOCOL;
  readonly version: typeof EVALUATOR_PROTOCOL_VERSION;
  readonly generationId: string;
  readonly sourceMaps: boolean;
  readonly detectorCoverage: EvaluatorDetectorCoverage;
  readonly status: "ok" | "failed";
  readonly modules: readonly EvaluatorModuleResult[];
  readonly failures: readonly EvaluatorFailure[];
  readonly stdout: string;
  readonly stderr: string;
}

export function encodeEvaluatorFrame(response: EvaluatorResponse): string {
  return `${EVALUATOR_FRAME}${canonicalJson(response)}\n`;
}

export function decodeEvaluatorFrame(
  stdout: string,
): { readonly response: EvaluatorResponse; readonly stdout: string } | undefined {
  const start = stdout.lastIndexOf(EVALUATOR_FRAME);
  if (start < 0) return undefined;
  const payloadStart = start + EVALUATOR_FRAME.length;
  const payloadEnd = stdout.indexOf("\n", payloadStart);
  const payload = stdout.slice(payloadStart, payloadEnd < 0 ? stdout.length : payloadEnd);
  try {
    const value: unknown = JSON.parse(payload);
    if (!isEvaluatorResponse(value)) return undefined;
    return {
      response: value,
      stdout: `${stdout.slice(0, start)}${payloadEnd < 0 ? "" : stdout.slice(payloadEnd + 1)}`,
    };
  } catch {
    return undefined;
  }
}
