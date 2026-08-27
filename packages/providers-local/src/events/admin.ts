import { randomUUID } from "node:crypto";
import { normalizeId } from "@relkit/contracts";
import {
  EVENT_ADMIN_PROTOCOL,
  EVENT_ADMIN_VERSION,
  type EventAdminActionContract,
  type EventAdminActionRecord,
  type EventAdminActionRequest,
  type EventAdminActionSink,
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

export * from "./admin-contracts.js";
export { EventAdminError } from "./admin-errors.js";

export interface EventAdminOptions {
  readonly mode?: EventAdminMode;
  readonly environment?: EventAdminMode;
  readonly enabled?: boolean;
  readonly now?: () => number;
  readonly createActionId?: () => string;
  readonly onAction?: EventAdminActionSink;
}

export interface EventAdmin {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly version: typeof EVENT_ADMIN_VERSION;
  readonly query: (request?: EventQueryRequest) => EventQueryContract;
  readonly retry: (request: string | EventAdminActionRequest) => Promise<EventAdminActionContract>;
  readonly actions: () => readonly EventAdminActionRecord[];
}

/** Exposes versioned event inspection and an audited local dead-letter retry. */
export function createEventAdmin(router: EventRouter, options: EventAdminOptions = {}): EventAdmin {
  const mode = options.environment ?? options.mode ?? "development";
  assertMode(mode);
  const enabled = options.enabled ?? mode !== "production";
  const records: EventAdminActionRecord[] = [];
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
  const requestedAt = options.now?.() ?? Date.now();
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

function safeReason(value: unknown): string | undefined {
  try {
    return readReason(value);
  } catch {
    return undefined;
  }
}
