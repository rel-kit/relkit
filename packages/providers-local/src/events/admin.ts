import { nativeNow } from "../native-services.js";
import type { EventAdminOptions, EventAdmin } from "./admin.types.js";
import { randomUUID } from "node:crypto";
import { normalizeId } from "@relkit/contracts";
import {
  EVENT_ADMIN_PROTOCOL,
  EVENT_ADMIN_VERSION,
  type EventAdminActionContract,
  type EventAdminActionRecord,
  type EventAdminActionRequest,
  type EventAdminMode,
  type EventQueryContract,
  type EventQueryRequest,
} from "./admin-contracts.js";
import { EventAdminError } from "./admin-errors.js";
import { makeRecord, recordAction } from "./admin-actions.js";
import type { EventRouter } from "./router-types.js";
import { findDelivery, isDeadLetter } from "./admin-state.js";
import {
  afterCursor,
  assertMode,
  assertVersion,
  matches,
  nextCursor,
  pageLimit,
  readReason,
  safeId,
  toCapability,
  toDelivery,
  toEvent,
  toPublication,
  toTrigger,
  validateQuery,
  versioned,
} from "./admin-utils.js";

export type { EventAdminOptions, EventAdmin } from "./admin.types.js";

export * from "./admin-contracts.js";
export { EventAdminError } from "./admin-errors.js";

/** Exposes versioned event inspection and an audited local dead-letter retry.
 * @param router - Owning event router operations.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns Versioned event inspection and audited retry operations.
 */
export function createEventAdmin(router: EventRouter, options: EventAdminOptions = {}): EventAdmin {
  const mode = options.environment ?? options.mode ?? "development";
  assertMode(mode);
  const enabled = options.enabled ?? mode !== "production";
  const records: EventAdminActionRecord[] = [];
  /**
   * Validates filters and collects a bounded versioned inspection response.
   * @param request - Validated scoped domain request.
   * @returns The immutable inspection page with its continuation cursor when needed.
   */
  const query = (request: EventQueryRequest = {}): EventQueryContract => {
    assertVersion(request);
    validateQuery(request);
    const snapshot = router.snapshot();
    const all = snapshot.deliveries
      .map(toDelivery)
      .filter((delivery) => matches(delivery, request))
      .filter((delivery) => afterCursor(delivery, request.cursor));
    const limit = pageLimit(request.limit);
    const items = all.slice(0, limit);
    const next = all.length > limit ? all[limit - 1] : undefined;
    const publications = snapshot.publications
      .map(toPublication)
      .filter(
        (publication) =>
          request.eventId === undefined || publication.eventId === normalizeId(request.eventId),
      )
      .filter(
        (publication) =>
          request.eventVersion === undefined || publication.version === request.eventVersion,
      )
      .slice(0, limit);
    return versioned({
      events: Object.freeze(snapshot.contracts.map(toEvent)),
      triggers: Object.freeze(snapshot.triggers.map(toTrigger)),
      capabilities: Object.freeze(snapshot.triggers.map(toCapability)),
      publications: Object.freeze(publications),
      items: Object.freeze(items),
      deliveries: Object.freeze(items),
      deadLetters: Object.freeze(items.filter(isDeadLetter)),
      ...(next === undefined ? {} : { nextCursor: nextCursor(next) }),
    });
  };
  /**
   * Copies retained audit records without exposing the mutable collection.
   * @returns The immutable action history.
   */
  const actions = (): readonly EventAdminActionRecord[] => Object.freeze([...records]);
  return Object.freeze({
    protocol: EVENT_ADMIN_PROTOCOL,
    version: EVENT_ADMIN_VERSION,
    query,
    retry: (request: string | EventAdminActionRequest) =>
      applyRetry(request, { router, mode, enabled, records, ...options }),
    actions,
  });
}

/** Retries an eligible dead-letter delivery and records success or rejection for auditing.
 * @param input - Caller-provided domain input.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The durable retry result after recording its outcome.
 */
async function applyRetry(
  input: string | EventAdminActionRequest,
  options: EventAdminOptions & {
    readonly router: EventRouter;
    readonly mode: EventAdminMode;
    readonly enabled: boolean;
    readonly records: EventAdminActionRecord[];
  },
): Promise<EventAdminActionContract> {
  const request = typeof input === "string" ? { deliveryId: input } : input;
  const deliveryId = safeId(request?.deliveryId);
  const actionId = safeId(options.createActionId?.() ?? randomUUID()) ?? "invalid-action";
  const requestedAt = options.now?.() ?? nativeNow();
  const before = findDelivery(options.router.snapshot(), deliveryId);
  try {
    assertVersion(request);
    const reason = readReason(request);
    if (!options.enabled || options.mode === "production")
      throw new EventAdminError(
        "RELKIT_EVENT_ADMIN_MUTATION_DISABLED",
        "Local event mutations are disabled",
      );
    if (deliveryId === undefined)
      throw new EventAdminError(
        "RELKIT_EVENT_ADMIN_DELIVERY_INVALID",
        "Event delivery ID is invalid",
      );
    if (before === undefined)
      throw new EventAdminError(
        "RELKIT_EVENT_ADMIN_NOT_FOUND",
        `Event delivery ${deliveryId} is unknown`,
      );
    if (before.state !== "dead-lettered")
      throw new EventAdminError(
        "RELKIT_EVENT_ADMIN_STATE_INELIGIBLE",
        "Only dead-lettered event deliveries can be retried",
      );
    await options.router.retry(deliveryId);
    const after = findDelivery(options.router.snapshot(), deliveryId);
    if (after === undefined)
      throw new EventAdminError("RELKIT_EVENT_ADMIN_ACTION_FAILED", "Retry state missing");
    const record = await recordAction(
      options,
      makeRecord(
        "retry",
        actionId,
        deliveryId,
        requestedAt,
        "applied",
        options.mode,
        before,
        after,
        undefined,
        reason,
      ),
    );
    return versioned({ action: "retry" as const, status: after, record });
  } catch (cause) {
    const error =
      cause instanceof EventAdminError
        ? cause
        : new EventAdminError("RELKIT_EVENT_ADMIN_ACTION_FAILED", "Event admin action failed");
    const record = await recordAction(
      options,
      makeRecord(
        "retry",
        actionId,
        deliveryId ?? "invalid",
        requestedAt,
        "rejected",
        options.mode,
        before,
        undefined,
        error.code,
        safeReason(request),
      ),
    );
    throw Object.assign(error, { action: record });
  }
}

/** Extracts a bounded reason without replacing the original admin rejection.
 * @param value - Value to validate, normalize or project.
 * @returns The bounded reason, or undefined when absent or invalid.
 */
function safeReason(value: unknown): string | undefined {
  try {
    return readReason(value);
  } catch {
    return undefined;
  }
}
