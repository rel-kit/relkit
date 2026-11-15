import { normalizeRetry, positive, json, validateStoredData } from "./delivery-validation.js";
import { normalizeId } from "../../contracts/index.js";
import type { JobQueue, JobQueueEntry } from "../jobs/queue-utils.js";
import type { UnknownEventEnvelope } from "../../events/index.js";
import { makeDeliveryId, normalizeEnvelope } from "./router-records.js";
import type { EventDeliveryResult } from "./delivery-types.js";
import { EventAdminError } from "./admin-errors.js";
import { Effect } from "effect";
import { localOperation, localPromise, type LocalOperationError } from "../local-effect.js";

export { validateStoredData, normalizeRetry, positive, json } from "./delivery-validation.js";

export { DEFAULT_RETRY } from "./delivery-validation.js";

export { ledger, ledgerFrom, records } from "./delivery-projection.js";

/** Projects a durable queue entry into the public delivery outcome.
 * @param entry - Current queue or storage entry.
 * @param triggerId - Registered trigger identity.
 * @param duplicate - Whether an existing acceptance satisfied this request.
 * @param status - Public lifecycle status.
 * @param error - Failure value to normalize or audit.
 * @param failure - Attempt failure to classify.
 * @param value - Value to validate, normalize or project.
 * @returns The public delivery outcome corresponding to queue state.
 */
export function resultFrom(
  entry: JobQueueEntry,
  triggerId: string,
  duplicate: boolean,
  status: EventDeliveryResult["status"],
  error?: unknown,
  failure?: EventDeliveryResult["failure"],
  value?: unknown,
): EventDeliveryResult {
  return Object.freeze({
    deliveryId: entry.instanceId,
    triggerId,
    eventInstanceId: normalizeEnvelope(entry.input).instanceId,
    accepted: true,
    persisted: true,
    status,
    state: entry.state as EventDeliveryResult["state"],
    attempt: entry.attempt,
    duplicate,
    ...(error === undefined ? {} : { error }),
    ...(failure === undefined ? {} : { failure }),
    ...(value === undefined ? {} : { value }),
  });
}

/** Requeues a dead-letter delivery through the durable queue transition owner.
 * @param queue - Owning durable queue operations.
 * @param triggerId - Registered trigger identity.
 * @param deliveryId - Stable delivery identity.
 * @param now - Current clock time in milliseconds.
 * @returns The requeued delivery outcome after durable transition.
 */
export async function retryDelivery(
  queue: JobQueue,
  triggerId: string,
  deliveryId: string,
  now: () => number,
): Promise<EventDeliveryResult> {
  const normalized = normalizeId(deliveryId);
  await queue.recover(now());
  const entry = await queue.adminRetry(normalized, { availableAt: now() });
  return resultFrom(entry, triggerId, false, "queued");
}

/** Runs one administrative delivery transition once the owner is known to be open.
 * @param name - Observed operation name.
 * @param ensureOpen - Lifecycle admission check of the delivery owner.
 * @param work - The durable transition.
 * @returns A lazy observed operation yielding the transition's outcome.
 */
export function administer(
  name: string,
  ensureOpen: () => Effect.Effect<void, LocalOperationError>,
  work: () => Promise<EventDeliveryResult>,
): Effect.Effect<EventDeliveryResult, LocalOperationError> {
  return localOperation(name, Effect.andThen(ensureOpen(), localPromise(work)));
}

/** Safe failure recorded on a delivery cancelled from the Inspector (the jobs' cancellation code). */
const CANCELLED = Object.freeze({
  kind: "cancellation",
  outcome: "cancelled",
  code: "RELKIT_JOB_ADMIN_CANCELLED",
  message: "Event delivery cancelled by local development action",
  retry: "never",
} as const);

/** Cancels a pending or scheduled delivery: it becomes a dead letter whose failure says cancelled.
 * @param queue - Owning durable queue operations.
 * @param triggerId - Registered trigger identity.
 * @param deliveryId - Stable delivery identity.
 * @param now - Current clock time in milliseconds.
 * @returns The cancelled delivery outcome after durable transition.
 * @remarks A delivery whose handler runs (leased) is refused like a terminal one: dead-lettering
 * it would make the handler's own acknowledgement fail.
 */
export async function cancelDelivery(
  queue: JobQueue,
  triggerId: string,
  deliveryId: string,
  now: () => number,
): Promise<EventDeliveryResult> {
  const normalized = normalizeId(deliveryId);
  await queue.recover(now());
  const state = queue.get(normalized)?.state;
  if (state === "leased" || state === "completed" || state === "dead-lettered")
    throw new EventAdminError(
      "RELKIT_EVENT_ADMIN_STATE_INELIGIBLE",
      "Only pending or scheduled event deliveries can be cancelled",
    );
  const entry = await queue.adminDeadLetter(normalized, CANCELLED);
  return resultFrom(entry, triggerId, false, "failed", undefined, entry.failure);
}

/** Promotes due delayed deliveries before selecting worker work.
 * @param queue - Owning durable queue operations.
 * @param now - Current clock time in milliseconds.
 * @returns A Promise completing after due entries are promoted.
 */
export async function promoteDue(queue: JobQueue, now: () => number): Promise<void> {
  const time = now();
  for (const entry of queue.snapshot()) {
    if (entry.state === "delayed" && (entry.availableAt ?? Number.MAX_SAFE_INTEGER) <= time) {
      await queue.transition(entry.instanceId, "available", {
        expectedState: "delayed",
        availableAt: time,
      });
    }
  }
}

/** Applies configured backlog overflow admission before durable acceptance.
 * @param queue - Owning durable queue operations.
 * @param envelope - Validated event envelope.
 * @param triggerId - Registered trigger identity.
 * @param profile - Local provider profile partition.
 * @param replayId - Identity of a replay delivery; a publication's own delivery derives its id.
 * @returns The admission decision after enforcing backlog policy.
 */
export async function admitDelivery(
  queue: JobQueue,
  envelope: UnknownEventEnvelope,
  triggerId: string,
  profile: string,
  replayId?: string,
): Promise<{ readonly entry: JobQueueEntry; readonly duplicate: boolean }> {
  const deliveryId = replayId ?? makeDeliveryId(envelope.instanceId, triggerId);
  const existing = queue.get(deliveryId);
  if (existing !== undefined) return { entry: existing, duplicate: true };
  const accepted = await queue.enqueue({
    instanceId: deliveryId,
    input: json(envelope),
    profile,
  });
  // A polling consumer may already have recovered and leased this accepted entry.
  // Recovery promotes only pending acceptance; it never rewinds an active delivery.
  await queue.recover(accepted.acceptedAt);
  return { entry: queue.get(deliveryId)!, duplicate: false };
}
