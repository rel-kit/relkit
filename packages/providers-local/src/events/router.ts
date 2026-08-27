import { join, resolve } from "node:path";
import { normalizeId } from "@relkit/contracts";
import type { EventContractInput } from "./admin-contracts.js";
import type { EventLogRecord } from "./log.js";
import type { UnknownEventEnvelope } from "@relkit/events";
import { createEventDelivery, type EventDelivery, type EventDeliveryBoundary } from "./delivery.js";
import { createEphemeralDelivery, type EphemeralDelivery } from "./ephemeral.js";
import type {
  EventDeliveryResult,
  EventFanoutResult,
  EventRouter,
  EventRouterInput,
  EventRouterOptions,
  EventRouterRouteOptions,
  EventRouterSnapshot,
  EventRouterTrigger,
  EventTriggerSnapshot,
} from "./router-types.js";
import {
  EventRouterStateError,
  normalizeDelivery,
  normalizeEnvelope,
  normalizeExpansion,
  type EventDeliveryRecord,
} from "./router-records.js";
import {
  createSnapshot,
  normalizeContract,
  publication,
  retryDelivery,
  drainDeliveries,
  runNextDelivery,
  type RegisteredTriggerView,
} from "./router-inspection.js";
export type {
  EventDeliveryResult,
  EventFanoutResult,
  EventRouter,
  EventRouterInput,
  EventRouterOptions,
  EventRouterRouteOptions,
  EventRouterSnapshot,
  EventRouterTrigger,
  EventTriggerSnapshot,
} from "./router-types.js";
export { EVENT_DELIVERY_VERSION, EventRouterStateError } from "./router-records.js";
export type { EventDeliveryRecord } from "./router-records.js";
type RegisteredTrigger = RegisteredTriggerView & { readonly ephemeral?: EphemeralDelivery };
/** Routes accepted envelopes using only the compiler's explicit expansions. */
export async function createEventRouter(
  requestedRoot: string,
  options: EventRouterOptions = {},
): Promise<EventRouter> {
  const root = resolve(requestedRoot);
  if (root === resolve("/")) throw new EventRouterStateError("Event router root is too broad");
  const triggers = new Map<string, RegisteredTrigger>();
  const contracts = new Map<string, EventContractInput>();
  const publications: EventLogRecord[] = [];
  let publicationSequence = 0;
  let closed = false;

  const registerContract = async (contract: unknown): Promise<void> => {
    ensureOpen();
    const normalized = normalizeContract(contract);
    const key = `${normalized.id}@${normalized.version}`;
    if (contracts.has(key)) throw new EventRouterStateError(`Duplicate event contract ${key}`);
    contracts.set(key, normalized);
  };
  const registerTrigger = async (binding: EventRouterTrigger): Promise<void> => {
    ensureOpen();
    const id = normalizeId(binding.id);
    if (triggers.has(id)) throw new EventRouterStateError(`Duplicate event trigger ${id}`);
    const delivery = normalizeDelivery(binding.delivery);
    if (typeof binding.invoke !== "function")
      throw new EventRouterStateError(`Event trigger ${id} has no invocation target`);
    const normalized: EventRouterTrigger = Object.freeze({
      ...binding,
      id,
      delivery,
      expansion: normalizeExpansion(binding.expansion),
    });
    const durable =
      delivery === "durable"
        ? await createEventDelivery(join(root, "triggers", id), normalized, {
            ...(options.now === undefined ? {} : { now: options.now }),
            ...(options.random === undefined ? {} : { random: options.random }),
            ...(options.ownerToken === undefined ? {} : { ownerToken: options.ownerToken }),
            ...(options.leaseDurationMs === undefined
              ? {}
              : { leaseDurationMs: options.leaseDurationMs }),
            onBoundary: (boundary) => options.onBoundary?.(boundary, id),
          })
        : undefined;
    const ephemeral =
      delivery === "ephemeral"
        ? createEphemeralDelivery(normalized.invoke, options.ephemeralCapacity)
        : undefined;
    triggers.set(id, {
      binding: normalized,
      ...(durable === undefined ? {} : { durable }),
      ...(ephemeral === undefined ? {} : { ephemeral }),
    });
  };
  const route = async (
    input: EventRouterInput,
    routeOptions: EventRouterRouteOptions = {},
  ): Promise<EventFanoutResult> => {
    ensureOpen();
    const event = normalizeEnvelope(input);
    publications.push(publication(input, event, ++publicationSequence, options.now ?? Date.now));
    const pair = `${event.eventId}@${event.version}`;
    const matching = [...triggers.values()]
      .filter(({ binding }) => binding.expansion.includes(pair))
      .sort((left, right) => left.binding.id.localeCompare(right.binding.id));
    const deliveries = await Promise.all(
      matching.map((trigger) => deliver(trigger, event, routeOptions.run !== false)),
    );
    return Object.freeze({
      event,
      matchedTriggerIds: Object.freeze(matching.map(({ binding }) => binding.id)),
      deliveries: Object.freeze(deliveries),
    });
  };
  const runNext = async (triggerId?: string): Promise<EventDeliveryResult | undefined> => {
    ensureOpen();
    return runNextDelivery(triggers, triggerId);
  };
  const drain = async (): Promise<readonly EventDeliveryResult[]> => {
    ensureOpen();
    return drainDeliveries(triggers);
  };
  const retry = async (deliveryId: string): Promise<EventDeliveryResult> => {
    ensureOpen();
    return retryDelivery(triggers, deliveryId);
  };
  const snapshot = (): EventRouterSnapshot => {
    ensureOpen();
    return createSnapshot(triggers, contracts, publications);
  };
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await Promise.all(
      [...triggers.values()].flatMap(({ durable }) => (durable ? [durable.close()] : [])),
    );
  };
  return Object.freeze({
    root,
    registerContract,
    registerTrigger,
    route,
    runNext,
    drain,
    retry,
    snapshot,
    close,
  });
  function ensureOpen(): void {
    if (closed) throw new EventRouterStateError("Event router is closed");
  }
}

async function deliver(
  { binding, durable, ephemeral }: RegisteredTrigger,
  envelope: UnknownEventEnvelope,
  run: boolean,
): Promise<EventDeliveryResult> {
  if (binding.delivery === "ephemeral") {
    if (ephemeral === undefined)
      throw new EventRouterStateError("Ephemeral trigger has no delivery limiter");
    return Object.freeze({
      triggerId: binding.id,
      delivery: binding.delivery,
      ...(await ephemeral.deliver(envelope)),
    });
  }
  if (durable === undefined) {
    return {
      triggerId: binding.id,
      delivery: binding.delivery,
      accepted: false,
      persisted: false,
      status: "failed",
      error: new EventRouterStateError("Durable trigger has no delivery"),
    };
  }
  try {
    const result = run ? await durable.deliver(envelope) : await durable.accept(envelope);
    return Object.freeze({ delivery: binding.delivery, ...result });
  } catch (error) {
    return Object.freeze({
      triggerId: binding.id,
      delivery: binding.delivery,
      accepted: false,
      persisted: false,
      status: "failed" as const,
      error,
    });
  }
}
