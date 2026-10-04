import { normalizeId } from "@relkit/contracts";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import {
  runInspectorPromise as runExecutionPromise,
  runInspectorSync as runExecutionSync,
} from "./native-edge.js";
import { InspectorActionError } from "./actions-errors.js";
import { bounded } from "./actions-utils.js";
import type { InspectorActionName, InspectorActionRequest } from "./actions.js";
import { InspectorControls, inspectorControlsLayer } from "./controls.service.js";
import { inspectorLoggerLayer, inspectorExecution } from "./execution.js";
import { InspectorActionIdentity } from "./actions.schemas.js";
import { projectionAttempt } from "./native-edge.js";
import type {
  InspectorActionResult,
  InspectorActionExecutionOptions,
} from "./actions-runtime.types.js";
export type { InspectorActionResult } from "./actions-runtime.types.js";

/** Finite compatibility calls share one control owner; installed routers own their own layer. */
const controls = ManagedRuntime.make(
  Layer.mergeAll(inspectorControlsLayer, inspectorLoggerLayer()),
);

/**
 * Lazily decodes only projected identity fields and validates action-specific inputs.
 * @param action - Declared action name.
 * @param target - Native route target identity.
 * @param body - Parsed body; unknown/private fields are never decoded as a whole.
 * @param headers - Optional identity header fallbacks.
 * @param signal - Native request cancellation signal.
 * @param decision - Explicit approval decision from the installed route.
 * @returns A typed request or the existing target/request validation error.
 */
export const parseInspectorActionEffect = Effect.fn("InspectorControls.parse")(
  function* (
    action: InspectorActionName,
    target: string | undefined,
    body: Record<string, unknown>,
    headers?: Headers,
    signal?: AbortSignal,
    decision?: "approve" | "deny",
  ) {
    const targetId = yield* projectionAttempt(() => normalizeId(target).toString()).pipe(
      Effect.mapError(
        () => new InspectorActionError("RELKIT_INSPECTOR_ACTION_TARGET_INVALID", 400),
      ),
    );
    const identity = yield* Schema.decodeUnknownEffect(InspectorActionIdentity)({
      generationId: body.generationId ?? headers?.get("x-relkit-generation-id"),
      graphHash: body.graphHash ?? headers?.get("x-relkit-graph-hash"),
      idempotencyKey: body.idempotencyKey ?? headers?.get("idempotency-key"),
    }).pipe(
      Effect.mapError(
        () => new InspectorActionError("RELKIT_INSPECTOR_ACTION_REQUEST_INVALID", 400),
      ),
    );
    if (body.reason !== undefined) yield* projectionAttempt(() => bounded(body.reason, 256));
    const resolvedDecision =
      decision ?? (yield* projectionAttempt(() => readDecision(body.decision)));
    const resolvedAction = resolvedDecision === "deny" ? "tool.deny" : action;
    if (resolvedAction === "tool.approve" || resolvedAction === "tool.deny") {
      yield* projectionAttempt(() => bounded(body.invocationId, 128));
      yield* projectionAttempt(() => bounded(body.toolCallId, 128));
      if (resolvedDecision === undefined)
        return yield* Effect.fail(
          new InspectorActionError("RELKIT_INSPECTOR_ACTION_REQUEST_INVALID", 400),
        );
    }
    return {
      action: resolvedAction,
      targetId,
      ...identity,
      body,
      ...(signal === undefined ? {} : { signal }),
    } satisfies InspectorActionRequest;
  },
  (effect) => observeExecution("inspector", "control.parse", effect),
);

/**
 * Parses an action synchronously through the reused finite execution owner.
 * @param action - Declared action name.
 * @param target - Native route target identity.
 * @param body - Parsed body supplying action inputs and identity.
 * @param headers - Optional identity header fallbacks.
 * @param signal - Native request cancellation signal.
 * @param decision - Explicit approval-route decision.
 * @returns A validated action request; validation throws the original public error.
 */
export function parseInspectorAction(
  action: InspectorActionName,
  target: string | undefined,
  body: Record<string, unknown>,
  headers?: Headers,
  signal?: AbortSignal,
  decision?: "approve" | "deny",
): InspectorActionRequest {
  return runExecutionSync(
    inspectorExecution,
    parseInspectorActionEffect(action, target, body, headers, signal, decision),
  );
}

/**
 * Executes an action using the finite compatibility owner.
 * @param request - Parsed action identity and inputs.
 * @param options - Native generation authority and configured environment.
 * @returns The authoritative receipt, retaining failures and concurrent deduplication.
 * @remarks Installed Hono routes call the same service on their own router runtime.
 */
export function executeInspectorAction(
  request: InspectorActionRequest,
  options: InspectorActionExecutionOptions,
): Promise<InspectorActionResult> {
  return runExecutionPromise(
    controls,
    Effect.flatMap(InspectorControls, (service) => service.execute(request, options)),
  );
}

/**
 * Accepts only the two declared tool approval decisions.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns The normalized approve or deny decision, or an existing request error.
 */
function readDecision(value: unknown): "approve" | "deny" | undefined {
  if (value === "approve" || value === "deny") return value;
  if (value === undefined) return undefined;
  throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_REQUEST_INVALID", 400);
}
