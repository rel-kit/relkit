import { createHash, randomUUID } from "node:crypto";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { nativeAttempt, runInspectorPromise, unwrapInspectorFailure } from "./native-edge.js";
import { inspectorExecution } from "./execution.js";
import { API_VERSION, PROTOCOL_VERSION, canonicalJson } from "@relkit/contracts";
import { isRecord, safeJson, type ResolvedActiveGeneration } from "./shared.js";
import { InspectorActionError } from "./actions-errors.js";
import { ACTION_REDACTION } from "./actions-projection.js";
import type { InspectorActionRequest, InspectorAuditRecord } from "./actions.js";
import type { InspectorMode } from "./shared.js";

/**
 * Validates nonempty action text against its declared length bound.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param max - Maximum accepted size or numeric bound.
 * @returns Trimmed bounded text; invalid values retain the existing action error.
 */
export function bounded(value: unknown, max = 128): string {
  const text = typeof value === "string" ? value.trim() : undefined;
  if (!text || text.length > max)
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_REQUEST_INVALID", 400);
  return text;
}

/**
 * Validates an optional administration reason without introducing a default reason.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Bounded text when supplied, otherwise undefined.
 */
export function reason(value: unknown): string | undefined {
  return value === undefined ? undefined : bounded(value, 256);
}

/**
 * Rejects absent or incompatible native administration authorities.
 * @param service - Optional service selector; ambiguous selections are rejected.
 * @param protocol - Expected native administration protocol.
 * @returns No value after protocol and version validation.
 */
export function assertProtocol(
  service: { readonly protocol?: string; readonly version?: number } | undefined,
  protocol: string,
): void {
  if (service === undefined)
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTIONS_UNAVAILABLE", 503);
  if (
    (service.protocol !== undefined && service.protocol !== protocol) ||
    (service.version !== undefined && service.version !== PROTOCOL_VERSION)
  )
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_PROTOCOL_MISMATCH", 400);
}

/**
 * Enforces the existing retry and cancellation eligibility rules.
 * @param action - Declared operation selected by the route.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns No value after validating the native action state.
 */
export function assertActionState(action: string, value: unknown): void {
  if (value === undefined) throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_NOT_FOUND", 404);
  if (!isRecord(value) || typeof value.state !== "string") return;
  if (action.endsWith(".retry") && value.state !== "dead-lettered")
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_STATE_INELIGIBLE", 409);
  if (
    action.endsWith(".cancel") &&
    ["completed", "dead-lettered", "cancelled"].includes(value.state)
  )
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_STATE_INELIGIBLE", 409);
}

/**
 * Hashes generation, graph, action, target and request inputs for authoritative deduplication.
 * @param request - Parsed action identity, target and input fields validated before dispatch.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns A stable digest kept outside public workload labels.
 */
export function requestFingerprint(
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
): string {
  const input = fingerprintField(request.body, "input") ?? null;
  const value = canonicalJson({
    action: request.action,
    targetId: request.targetId,
    generationId: generation.generationId,
    graphHash: generation.graphHash,
    idempotencyKey: request.idempotencyKey,
    input,
    invocationId: fingerprintField(request.body, "invocationId") ?? null,
    toolCallId: fingerprintField(request.body, "toolCallId") ?? null,
    reason: fingerprintField(request.body, "reason") ?? null,
  });
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Selects stored fingerprint inputs without evaluating an executable accessor.
 * @param body - Parsed JSON body or a standalone compatibility request.
 * @param key - Declared fingerprint field.
 * @returns Its stored value; accessor-backed inputs are invalid requests.
 */
function fingerprintField(body: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(body, key);
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor))
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_REQUEST_INVALID", 400);
  return descriptor.value;
}

/**
 * Rejects production actions, environment mismatches and stale generation identities.
 * @param request - Parsed action identity, target and input fields validated before dispatch.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param mode - Configured Inspector environment used for authorization and audit identity.
 * @returns No value after validating the authoritative active identity.
 */
export function validateIdentity(
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
  mode: InspectorMode,
): void {
  if (mode === "production")
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTIONS_DISABLED", 403);
  const requestedMode = request.body.environment ?? request.body.mode;
  if (requestedMode !== undefined && requestedMode !== mode)
    throw new InspectorActionError("RELKIT_INSPECTOR_ENVIRONMENT_MISMATCH", 400);
  if (
    request.generationId !== generation.generationId ||
    request.graphHash !== generation.graphHash
  )
    throw new InspectorActionError("RELKIT_INSPECTOR_GENERATION_NOT_ACTIVE", 409);
}

/**
 * Constructs one redacted action audit using the authoritative generation identity.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - Parsed action identity, target and input fields validated before dispatch.
 * @param mode - Configured Inspector environment used for authorization and audit identity.
 * @param outcome - Authoritative action outcome recorded by the audit.
 * @param errorCode - Optional bounded public failure code.
 * @returns Versioned audit evidence with a fresh action identifier.
 */
export function makeAudit(
  generation: ResolvedActiveGeneration,
  request: InspectorActionRequest,
  mode: InspectorMode,
  outcome: "applied" | "rejected",
  errorCode?: string,
): InspectorAuditRecord {
  const actionReason = reason(request.body.reason);
  const redactedReason = safeJson({ reason: actionReason }, ACTION_REDACTION);
  const safeReason =
    isRecord(redactedReason) && typeof redactedReason.reason === "string"
      ? redactedReason.reason
      : undefined;
  return {
    protocol: "relkit.inspector.actions",
    version: API_VERSION,
    actionId: randomUUID(),
    action: request.action,
    targetId: request.targetId,
    generationId: generation.generationId,
    graphHash: generation.graphHash,
    environment: mode,
    idempotencyKey: request.idempotencyKey,
    outcome,
    requestedAt: new Date().toISOString(),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(safeReason === undefined ? {} : { reason: safeReason }),
  };
}

/**
 * Lazily delivers audit evidence without letting a sink change an authoritative action.
 * @param generation - Native action audit authority.
 * @param record - Already-redacted action evidence.
 * @returns Completion even when the native audit sink fails; interruption remains distinct.
 */
export const writeAuditEffect = Effect.fn("InspectorControls.audit")(
  (generation: ResolvedActiveGeneration, record: InspectorAuditRecord) =>
    nativeAttempt(() => generation.actions?.audit?.(record)).pipe(
      Effect.asVoid,
      Effect.catch(() => Effect.logWarning("Inspector action audit sink unavailable")),
    ),
  (effect) => observeExecution("inspector", "control.audit", effect),
);

/**
 * Delivers audit evidence through the reused finite compatibility owner.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param record - Already projected record or audit evidence.
 * @returns Completion after best-effort native audit delivery.
 */
export function writeAudit(
  generation: ResolvedActiveGeneration,
  record: InspectorAuditRecord,
): Promise<void> {
  return runInspectorPromise(inspectorExecution, writeAuditEffect(generation, record));
}

/**
 * Maps native failures into the existing action status and public code contract.
 * @param error - Native or validation failure to preserve in the public compatibility envelope.
 * @returns The existing action failure object, or a compatible bounded failure.
 */
export function toActionError(error: unknown): InspectorActionError {
  error = unwrapInspectorFailure(error);
  if (error instanceof InspectorActionError) return error;
  const code =
    isRecord(error) && typeof error.code === "string"
      ? error.code
      : "RELKIT_INSPECTOR_ACTION_FAILED";
  const status = code.includes("NOT_FOUND")
    ? 404
    : code.includes("MUTATION_DISABLED")
      ? 403
      : code.includes("PROTOCOL") || code.includes("REQUEST")
        ? 400
        : 409;
  return new InspectorActionError(
    code.startsWith("RELKIT_") ? code : "RELKIT_INSPECTOR_ACTION_FAILED",
    status,
  );
}
