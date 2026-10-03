import type { RegisteredTrigger } from "./router.types.js";
import { deliver } from "./router-delivery.js";
import { Effect, Ref } from "effect";
import { localOperation, localPromise, runLocal } from "../local-effect.js";
import { join, resolve } from "node:path";
import { normalizeId } from "@relkit/contracts";
import type { EventContractInput } from "./admin-contracts.js";
import type { EventLogRecord } from "./log.js";
import { createEventDelivery } from "./delivery.js";
import { createEphemeralDelivery } from "./ephemeral.js";
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
  type EventDeliveryRecord,
} from "./router-records.js";
import {
  createSnapshot,
  normalizeContract,
  publication,
  retryDelivery,
  drainDeliveries,
  runNextDelivery,
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
/** Routes accepted envelopes to independently delivered exact-event triggers.
 * @param requestedRoot - Requested owned state directory.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The recovered router with explicit worker and close operations.
 */
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
  const closed = Effect.runSync(Ref.make(false));

  /**
   * Validates and registers one event contract identity.
   * @param contract - Declared event contract.
   * @returns The registration operation after validation.
   */
  const registerContract = async (contract: unknown): Promise<void> => {
    ensureOpen();
    const normalized = normalizeContract(contract);
    const key = `${normalized.id}@${normalized.version}`;
    if (contracts.has(key)) throw new EventRouterStateError(`Duplicate event contract ${key}`);
    contracts.set(key, normalized);
  };
  /**
   * Acquires the delivery owner and registers a validated event target.
   * @param binding - Target binding with delivery and retry configuration.
   * @returns The registration operation after recovery and acquisition.
   */
  const registerTrigger = async (binding: EventRouterTrigger): Promise<void> => {
    ensureOpen();
    const id = normalizeId(binding.id);
    if (triggers.has(id)) throw new EventRouterStateError(`Duplicate event trigger ${id}`);
    const delivery = normalizeDelivery(binding.delivery);
    if (typeof binding.invoke !== "function")
      throw new EventRouterStateError(`Event trigger ${id} has no invocation target`);
    if (!Number.isSafeInteger(binding.eventVersion) || binding.eventVersion < 1)
      throw new EventRouterStateError(`Event trigger ${id} has an invalid event version`);
    const normalized: EventRouterTrigger = Object.freeze({
      ...binding,
      id,
      delivery,
      eventId: normalizeId(binding.eventId),
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
        ? createEphemeralDelivery(
            (envelope) =>
              normalized.invoke(envelope, {
                attempt: 1,
                replayed: false,
                ...(normalized.timeoutMs === undefined ? {} : { timeoutMs: normalized.timeoutMs }),
              }),
            options.ephemeralCapacity,
          )
        : undefined;
    triggers.set(id, {
      binding: normalized,
      ...(durable === undefined ? {} : { durable }),
      ...(ephemeral === undefined ? {} : { ephemeral }),
    });
  };
  /**
   * Fans out a validated publication with bounded independent trigger concurrency.
   * @param input - Caller operation input.
   * @param routeOptions - Whether fanout waits for handler execution.
   * @returns The publication result containing ordered per-trigger outcomes.
   */
  const route = async (
    input: EventRouterInput,
    routeOptions: EventRouterRouteOptions = {},
  ): Promise<EventFanoutResult> => {
    ensureOpen();
    const event = normalizeEnvelope(input);
    publications.push(publication(input, event, ++publicationSequence, options.now ?? Date.now));
    const matching = [...triggers.values()]
      .filter(
        ({ binding }) =>
          binding.eventId === event.eventId && binding.eventVersion === event.version,
      )
      .sort((left, right) => left.binding.id.localeCompare(right.binding.id));
    const deliveries = await runLocal(
      localOperation(
        "EventRouter.fanout",
        Effect.forEach(
          matching,
          (trigger) => localPromise(() => deliver(trigger, event, routeOptions.run !== false)),
          { concurrency: 8 },
        ),
      ),
    );
    return Object.freeze({
      event,
      matchedTriggerIds: Object.freeze(matching.map(({ binding }) => binding.id)),
      deliveries: Object.freeze(deliveries),
    });
  };
  /**
   * Runs one eligible durable delivery and commits its attempt outcome.
   * @param triggerId - Registered trigger identity.
   * @returns The delivery outcome, or undefined when there is no eligible work.
   */
  const runNext = async (triggerId?: string): Promise<EventDeliveryResult | undefined> => {
    ensureOpen();
    return runNextDelivery(triggers, triggerId);
  };
  /**
   * Waits for work currently admitted by the registered delivery owners.
   * @returns The drain operation completing when admitted work settles.
   */
  const drain = async (): Promise<readonly EventDeliveryResult[]> => {
    ensureOpen();
    await Promise.all([...triggers.values()].map(({ ephemeral }) => ephemeral?.drain()));
    return drainDeliveries(triggers);
  };
  /**
   * Requeues a dead-letter delivery through its durable owner.
   * @param deliveryId - Durable delivery identity.
   * @returns The delivery retry outcome after acknowledgement.
   */
  const retry = async (deliveryId: string): Promise<EventDeliveryResult> => {
    ensureOpen();
    return retryDelivery(triggers, deliveryId);
  };
  /**
   * Copies owner state into its safe immutable inspection representation.
   * @returns The snapshot operation without exposing mutable owner state.
   */
  const snapshot = (): EventRouterSnapshot => {
    ensureOpen();
    return createSnapshot(triggers, contracts, publications);
  };
  /**
   * Stops new admission and joins the owner resource finalization boundary.
   * @returns The close operation completing after its owned durable work has settled.
   */
  const close = async (): Promise<void> => {
    if (Ref.getUnsafe(closed)) return;
    Effect.runSync(Ref.set(closed, true));
    // Ephemeral invocation belongs to its publishing caller; only explicit drain waits for it.
    await runLocal(
      localOperation(
        "EventRouter.close",
        Effect.forEach(
          [...triggers.values()],
          ({ durable }) =>
            Effect.gen(function* () {
              if (durable) yield* localPromise(() => durable.close());
            }),
          { concurrency: 8, discard: true },
        ),
      ),
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
  /**
   * Checks whether the owner still admits new operations.
   * @returns A lazy validation effect failing with the established closed-owner error.
   */
  function ensureOpen(): void {
    if (Ref.getUnsafe(closed)) throw new EventRouterStateError("Event router is closed");
  }
}
