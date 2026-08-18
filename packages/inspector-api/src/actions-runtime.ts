import { PROTOCOL_VERSION, normalizeId } from "@zsys/contracts";
import { identity, type ResolvedActiveGeneration } from "./shared.js";
import { InspectorActionError } from "./actions-errors.js";
import {
  bounded,
  makeAudit,
  requestFingerprint,
  toActionError,
  validateIdentity,
  writeAudit,
} from "./actions-utils.js";
import { dispatchInspectorAction } from "./actions-dispatch.js";
import type { InspectorActionName, InspectorActionRequest } from "./actions.js";
import type { InspectorMode } from "./shared.js";

export interface InspectorActionResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly fingerprint: string;
}

const defaultIdempotency = new Map<string, Promise<InspectorActionResult>>();

export function parseInspectorAction(
  action: InspectorActionName,
  target: string | undefined,
  body: Record<string, unknown>,
  headers?: Headers,
  signal?: AbortSignal,
  decision?: "approve" | "deny",
): InspectorActionRequest {
  let targetId: string;
  try {
    targetId = normalizeId(target).toString();
  } catch {
    throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_TARGET_INVALID", 400);
  }
  const generationId = bounded(body.generationId ?? headers?.get("x-zsys-generation-id"), 128);
  const graphHash = bounded(body.graphHash ?? headers?.get("x-zsys-graph-hash"), 256);
  const idempotencyKey = bounded(body.idempotencyKey ?? headers?.get("idempotency-key"), 128);
  if (body.reason !== undefined) bounded(body.reason, 256);
  const resolvedDecision = decision ?? readDecision(body.decision);
  const resolvedAction = resolvedDecision === "deny" ? "tool.deny" : action;
  if (resolvedAction === "tool.approve" || resolvedAction === "tool.deny") {
    bounded(body.invocationId, 128);
    bounded(body.toolCallId, 128);
    if (resolvedDecision === undefined)
      throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_REQUEST_INVALID", 400);
  }
  return {
    action: resolvedAction,
    targetId,
    generationId,
    graphHash,
    idempotencyKey,
    body,
    ...(signal === undefined ? {} : { signal }),
  };
}

export async function executeInspectorAction(
  request: InspectorActionRequest,
  options: {
    readonly mode: InspectorMode;
    readonly getGeneration: () => Promise<ResolvedActiveGeneration | undefined>;
    readonly idempotency?: Map<string, Promise<InspectorActionResult>>;
  },
): Promise<InspectorActionResult> {
  const generation = await options.getGeneration();
  if (generation === undefined)
    throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_GENERATION_UNAVAILABLE", 503);
  try {
    validateIdentity(request, generation, options.mode);
  } catch (error) {
    return await rejectAction(error, request, generation, options.mode);
  }
  const key =
    generation.generationId +
    ":" +
    request.action +
    ":" +
    request.targetId +
    ":" +
    request.idempotencyKey;
  const fingerprint = requestFingerprint(request, generation);
  const store = options.idempotency ?? defaultIdempotency;
  const existing = store.get(key);
  if (existing !== undefined) {
    if ((await existing).fingerprint !== fingerprint)
      return await rejectAction(
        new InspectorActionError("ZSYS_INSPECTOR_IDEMPOTENCY_CONFLICT", 409),
        request,
        generation,
        options.mode,
      );
    return await existing;
  }
  const pending = perform(request, generation, options.mode, fingerprint).catch((error) =>
    rejectAction(error, request, generation, options.mode),
  );
  store.set(key, pending);
  return await pending;
}

async function rejectAction(
  error: unknown,
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
  mode: InspectorMode,
): Promise<never> {
  const failure = toActionError(error);
  const record = makeAudit(generation, request, mode, "rejected", failure.code);
  await writeAudit(generation, record);
  throw new InspectorActionError(failure.code, failure.status, {
    ...identity(generation),
    action: record,
    error: failure.code,
  });
}

async function perform(
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
  mode: InspectorMode,
  fingerprint: string,
): Promise<InspectorActionResult> {
  if (generation.actions === undefined)
    throw new InspectorActionError("ZSYS_INSPECTOR_ACTIONS_UNAVAILABLE", 503);
  const result = await dispatchInspectorAction(request, generation, generation.actions);
  const record = makeAudit(generation, request, mode, "applied");
  await writeAudit(generation, record);
  return {
    status: 200,
    fingerprint,
    body: { ...identity(generation), action: record, ...result },
  };
}

function readDecision(value: unknown): "approve" | "deny" | undefined {
  if (value === "approve" || value === "deny") return value;
  if (value === undefined) return undefined;
  throw new InspectorActionError("ZSYS_INSPECTOR_ACTION_REQUEST_INVALID", 400);
}
