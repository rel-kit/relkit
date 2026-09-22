import {
  EVALUATOR_PROTOCOL,
  EVALUATOR_PROTOCOL_VERSION,
  type EvaluatorCandidate,
  type EvaluatorDetectorCoverage,
  type EvaluatorRequest,
  type EvaluatorResponse,
} from "./evaluator-protocol.js";

export function isEvaluatorRequest(value: unknown): value is EvaluatorRequest {
  if (!isRecord(value)) return false;
  return (
    value.protocol === EVALUATOR_PROTOCOL &&
    value.version === EVALUATOR_PROTOCOL_VERSION &&
    typeof value.generationId === "string" &&
    typeof value.projectRoot === "string" &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isCandidate) &&
    Array.isArray(value.environmentAllowlist) &&
    value.environmentAllowlist.every((name) => typeof name === "string") &&
    typeof value.generatedDirectory === "string" &&
    Array.isArray(value.networkAllowlist) &&
    value.networkAllowlist.every((host) => typeof host === "string") &&
    typeof value.sourceMaps === "boolean" &&
    typeof value.timeoutMs === "number"
  );
}

export function isEvaluatorResponse(value: unknown): value is EvaluatorResponse {
  if (!isRecord(value)) return false;
  return (
    value.protocol === EVALUATOR_PROTOCOL &&
    value.version === EVALUATOR_PROTOCOL_VERSION &&
    typeof value.generationId === "string" &&
    typeof value.sourceMaps === "boolean" &&
    isDetectorCoverage(value.detectorCoverage) &&
    (value.status === "ok" || value.status === "failed") &&
    Array.isArray(value.modules) &&
    Array.isArray(value.failures) &&
    typeof value.stdout === "string" &&
    typeof value.stderr === "string"
  );
}

function isCandidate(value: unknown): value is EvaluatorCandidate {
  return isRecord(value) && typeof value.file === "string";
}

function isDetectorCoverage(value: unknown): value is EvaluatorDetectorCoverage {
  return (
    isRecord(value) &&
    Array.isArray(value.supported) &&
    value.supported.every((entry) => typeof entry === "string") &&
    Array.isArray(value.unsupported) &&
    value.unsupported.every((entry) => typeof entry === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
