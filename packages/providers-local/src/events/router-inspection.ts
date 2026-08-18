import { deepFreeze, isJsonValue, normalizeId } from "@zsys/contracts";
import type { EventContractInput } from "./admin-contracts.js";
import type { EventLogRecord } from "./log.js";
import type { EventDelivery, EventDeliveryLedgerRecord } from "./delivery.js";
import type { UnknownEventEnvelope } from "@zsys/events";
import type {
  EventDeliveryResult,
  EventRouterInput,
  EventRouterSnapshot,
  EventRouterTrigger,
  EventTriggerSnapshot,
} from "./router-types.js";
import { EventRouterStateError } from "./router-records.js";

export interface RegisteredTriggerView {
  readonly binding: EventRouterTrigger;
  readonly durable?: EventDelivery;
  readonly ephemeral?: unknown;
}

export function normalizeContract(value: unknown): EventContractInput {
  if (!isRecord(value) || value.kind !== "event")
    throw new EventRouterStateError("Event contract is invalid");
  const id = normalizeId(value.id);
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 1)
    throw new EventRouterStateError(`Event contract ${id} has an invalid version`);
  if (!isJsonValue(value.payload))
    throw new EventRouterStateError(`Event contract ${id} is not JSON-safe`);
  if (value.source !== undefined && !isJsonValue(value.source))
    throw new EventRouterStateError(`Event contract ${id} has an invalid source`);
  if (
    value.sensitiveFields !== undefined &&
    (!Array.isArray(value.sensitiveFields) ||
      value.sensitiveFields.some((field) => typeof field !== "string"))
  )
    throw new EventRouterStateError(`Event contract ${id} has invalid sensitive fields`);
  return deepFreeze({
    id,
    version: value.version,
    payload: value.payload,
    ...(value.sensitiveFields === undefined ? {} : { sensitiveFields: value.sensitiveFields }),
    ...(value.source === undefined ? {} : { source: value.source }),
  });
}

export function publication(
  input: EventRouterInput,
  envelope: UnknownEventEnvelope,
  fallbackSequence: number,
  now: () => number,
): EventLogRecord {
  if (isEventLogRecord(input)) return input;
  return deepFreeze({
    version: 1 as const,
    sequence: fallbackSequence,
    kind: "accepted" as const,
    accepted: true as const,
    timestamp: now(),
    envelope,
  });
}

export function triggerSnapshot(binding: EventRouterTrigger): EventTriggerSnapshot {
  return deepFreeze({
    id: binding.id,
    ...(binding.targetFunctionId === undefined
      ? {}
      : { targetFunctionId: binding.targetFunctionId }),
    ...(binding.selector === undefined ? {} : { selector: binding.selector }),
    expansion: binding.expansion,
    delivery: binding.delivery,
    ...(binding.profile === undefined ? {} : { profile: binding.profile }),
    ...(binding.retry === undefined ? {} : { retry: binding.retry }),
    ...(binding.concurrency === undefined ? {} : { concurrency: binding.concurrency }),
  });
}

export function createSnapshot(
  triggers: ReadonlyMap<string, RegisteredTriggerView>,
  contracts: ReadonlyMap<string, EventContractInput>,
  publications: readonly EventLogRecord[],
): EventRouterSnapshot {
  const durable = [...triggers.values()].filter(
    (trigger): trigger is RegisteredTriggerView & { readonly durable: EventDelivery } =>
      trigger.durable !== undefined,
  );
  const records = durable.flatMap(({ durable: delivery }) => delivery.snapshot().records);
  records.sort(
    (left, right) =>
      left.timestamp - right.timestamp ||
      left.sequence - right.sequence ||
      left.triggerId.localeCompare(right.triggerId),
  );
  const latest = new Map<string, EventDeliveryLedgerRecord>();
  for (const { durable: delivery } of durable)
    for (const entry of delivery.snapshot().ledger) {
      const previous = latest.get(entry.deliveryId);
      if (previous === undefined || entry.cursor >= previous.cursor)
        latest.set(entry.deliveryId, entry);
    }
  return Object.freeze({
    records: Object.freeze(records),
    contracts: Object.freeze([...contracts.values()]),
    triggers: Object.freeze(
      [...triggers.values()]
        .map(({ binding }) => triggerSnapshot(binding))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ),
    publications: Object.freeze([...publications]),
    deliveries: Object.freeze(
      [...latest.values()].sort(
        (left, right) =>
          left.cursor - right.cursor || left.deliveryId.localeCompare(right.deliveryId),
      ),
    ),
  });
}

export async function retryDelivery(
  triggers: ReadonlyMap<string, RegisteredTriggerView>,
  deliveryId: string,
): Promise<EventDeliveryResult> {
  for (const { binding, durable } of triggers.values()) {
    if (durable?.snapshot().ledger.some((entry) => entry.deliveryId === deliveryId))
      return Object.freeze({ delivery: binding.delivery, ...(await durable.retry(deliveryId)) });
  }
  throw new EventRouterStateError(`Unknown event delivery ${deliveryId}`);
}

export async function runNextDelivery(
  triggers: ReadonlyMap<string, RegisteredTriggerView>,
  triggerId?: string,
): Promise<EventDeliveryResult | undefined> {
  const normalized = triggerId === undefined ? undefined : normalizeId(triggerId);
  const candidates = [...triggers.values()]
    .filter(
      ({ binding, durable }) =>
        durable !== undefined && (normalized === undefined || binding.id === normalized),
    )
    .sort((left, right) => left.binding.id.localeCompare(right.binding.id));
  if (normalized !== undefined && candidates.length === 0)
    throw new EventRouterStateError(`Unknown event trigger ${normalized}`);
  for (const { binding, durable } of candidates) {
    const result = await durable!.runNext();
    if (result !== undefined) return Object.freeze({ delivery: binding.delivery, ...result });
  }
  return undefined;
}

export async function drainDeliveries(
  triggers: ReadonlyMap<string, RegisteredTriggerView>,
): Promise<readonly EventDeliveryResult[]> {
  const results: EventDeliveryResult[] = [];
  while (true) {
    const result = await runNextDelivery(triggers);
    if (result === undefined) return Object.freeze(results);
    results.push(result);
  }
}

function isEventLogRecord(value: EventRouterInput): value is EventLogRecord {
  return "kind" in value && value.kind === "accepted" && "sequence" in value;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
