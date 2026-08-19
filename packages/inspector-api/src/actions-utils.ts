import { createHash, randomUUID } from "node:crypto";
import { API_VERSION, PROTOCOL_VERSION, canonicalJson } from "@zsys/contracts";
import { isRecord, safeJson, type ResolvedActiveGeneration } from "./shared.js";
import { InspectorActionError } from "./actions-errors.js";
import { ACTION_REDACTION } from "./actions-projection.js";
import type { InspectorActionRequest, InspectorAuditRecord } from "./actions.js";
import type { InspectorMode } from "./shared.js";

export function bounded(value: unknown, max = 128): string {
  const text = typeof value === "string" ? value.trim() : undefined;
  if (!text || text.length > max)
    throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_REQUEST_INVALID", 400);
  return text;
}

export function reason(value: unknown): string | undefined {
  return value === undefined ? undefined : bounded(value, 256);
}

export function assertProtocol(
  service: { readonly protocol?: string; readonly version?: number } | undefined,
  protocol: string,
): void {
  if (service === undefined)
    throw new InspectorActionError("ZSYS_INSPECTOR_ACTIONS_UNAVAILABLE", 503);
  if (
    (service.protocol !== undefined && service.protocol !== protocol) ||
    (service.version !== undefined && service.version !== PROTOCOL_VERSION)
  )
    throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_PROTOCOL_MISMATCH", 400);
}

export function assertActionState(action: string, value: unknown): void {
  if (value === undefined) throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_NOT_FOUND", 404);
  if (!isRecord(value) || typeof value.state !== "string") return;
  if (action.endsWith(".retry") && value.state !== "dead-lettered")
    throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_STATE_INELIGIBLE", 409);
  if (
    action.endsWith(".cancel") &&
    ["completed", "dead-lettered", "cancelled"].includes(value.state)
  )
    throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_STATE_INELIGIBLE", 409);
}

export function requestFingerprint(
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
): string {
  const input = request.body.input === undefined ? null : safeJson(request.body.input);
  const value = canonicalJson({
    action: request.action,
    targetId: request.targetId,
    generationId: generation.generationId,
    graphHash: generation.graphHash,
    idempotencyKey: request.idempotencyKey,
    input,
    invocationId: request.body.invocationId ?? null,
    toolCallId: request.body.toolCallId ?? null,
    reason: request.body.reason ?? null,
  });
  return createHash("sha256").update(value).digest("hex");
}

export function validateIdentity(
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
  mode: InspectorMode,
): void {
  if (mode === "production") throw new InspectorActionError("ZSYS_INSPECTOR_ACTIONS_DISABLED", 403);
  const requestedMode = request.body.environment ?? request.body.mode;
  if (requestedMode !== undefined && requestedMode !== mode)
    throw new InspectorActionError("ZSYS_INSPECTOR_ENVIRONMENT_MISMATCH", 400);
  if (
    request.generationId !== generation.generationId ||
    request.graphHash !== generation.graphHash
  )
    throw new InspectorActionError("ZSYS_INSPECTOR_GENERATION_NOT_ACTIVE", 409);
}

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
    protocol: "zsys.inspector.actions",
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

export async function writeAudit(
  generation: ResolvedActiveGeneration,
  record: InspectorAuditRecord,
): Promise<void> {
  try {
    await generation.actions?.audit?.(record);
  } catch {
    // Audit sinks cannot turn a safe action response into an unsafe provider error.
  }
}

export function toActionError(error: unknown): InspectorActionError {
  if (error instanceof InspectorActionError) return error;
  const code =
    isRecord(error) && typeof error.code === "string" ? error.code : "ZSYS_INSPECTOR_ACTION_FAILED";
  const status = code.includes("NOT_FOUND")
    ? 404
    : code.includes("MUTATION_DISABLED")
      ? 403
      : code.includes("PROTOCOL") || code.includes("REQUEST")
        ? 400
        : 409;
  return new InspectorActionError(
    code.startsWith("ZSYS_") ? code : "ZSYS_INSPECTOR_ACTION_FAILED",
    status,
  );
}
