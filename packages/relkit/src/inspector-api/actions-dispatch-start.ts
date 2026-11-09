/**
 * Dispatches the actions that start new work rather than administer existing work: publishing
 * an event, replaying a recorded publication, and triggering a job run. Each goes through the
 * application's own events or jobs authority, so consumers and runs behave as in normal traffic.
 */
import { Effect } from "effect";
import { PROTOCOL_VERSION } from "relkit/contracts";
import { observeExecution } from "relkit/contracts/operation";
import { InspectorActionError } from "./actions-errors.js";
import { ACTION_REDACTION } from "./actions-projection.js";
import { assertProtocol, reason } from "./actions-utils.js";
import { nativeAttempt, projectionAttempt } from "./native-edge.js";
import { safeJson } from "./shared.js";
import type {
  InspectorActionRequest,
  InspectorActionServices,
  InspectorEventPublishRequest,
  InspectorEventReplayRequest,
  InspectorJobTriggerRequest,
} from "./actions.types.js";

/** Actions this module dispatches. */
export const START_ACTIONS: ReadonlySet<string> = new Set([
  "job.trigger",
  "event.publish",
  "event.replay",
]);

/**
 * Starts a job run, publishes an event or replays a publication.
 * @param request - Parsed action; `body.input` holds the job input or event payload.
 * @param actions - Native active-generation authorities.
 * @returns The redacted native result under `result`.
 */
export const dispatchStartActionEffect = Effect.fn("Inspector.dispatchStartAction")(
  function* (request: InspectorActionRequest, actions: InspectorActionServices) {
    if (request.action === "job.trigger") {
      const service = actions.jobs;
      yield* projectionAttempt(() => assertProtocol(service, "relkit.jobs.admin"));
      const trigger = service?.trigger;
      if (trigger === undefined) return yield* unsupported;
      const value = yield* nativeAttempt(() =>
        trigger.call(service, {
          protocol: "relkit.jobs.admin",
          version: PROTOCOL_VERSION,
          jobId: request.targetId,
          input: request.body.input ?? null,
          idempotencyKey: request.idempotencyKey,
        } satisfies InspectorJobTriggerRequest),
      );
      return { result: safeJson(value, ACTION_REDACTION) };
    }
    const service = actions.events;
    yield* projectionAttempt(() => assertProtocol(service, "relkit.events.admin"));
    if (request.action === "event.publish") {
      const publish = service?.publish;
      if (publish === undefined) return yield* unsupported;
      const eventVersion = yield* projectionAttempt(() => version(request.body.eventVersion));
      const value = yield* nativeAttempt(() =>
        publish.call(service, {
          protocol: "relkit.events.admin",
          version: PROTOCOL_VERSION,
          eventId: request.targetId,
          ...(eventVersion === undefined ? {} : { eventVersion }),
          payload: request.body.input ?? null,
          idempotencyKey: request.idempotencyKey,
        } satisfies InspectorEventPublishRequest),
      );
      return { result: safeJson(value, ACTION_REDACTION) };
    }
    const replay = service?.replay;
    if (replay === undefined) return yield* unsupported;
    const replayReason = yield* projectionAttempt(() => reason(request.body.reason));
    const value = yield* nativeAttempt(() =>
      replay.call(service, {
        protocol: "relkit.events.admin",
        version: PROTOCOL_VERSION,
        publicationId: request.targetId,
        idempotencyKey: request.idempotencyKey,
        ...(replayReason === undefined ? {} : { reason: replayReason }),
      } satisfies InspectorEventReplayRequest),
    );
    return { result: safeJson(value, ACTION_REDACTION) };
  },
  (effect) => observeExecution("inspector", "dispatchStartAction", effect),
);

const unsupported = Effect.fail(
  new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501),
);

/**
 * Accepts an optional positive integer event version.
 * @param value - Body field.
 * @returns The version, or undefined to publish the latest version.
 */
function version(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_REQUEST_INVALID", 400);
}
