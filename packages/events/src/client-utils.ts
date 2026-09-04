import { validate, type StandardIssue, type StandardSchemaV1 } from "@relkit/schema";
import type {
  EventAttributeValue,
  EventPublishOptions,
  EventPublishResult,
} from "@relkit/functions";
import type {
  EventClientOptions,
  EventOperationContext,
  EventProvider,
  EventProviderResult,
} from "./client.js";

export class EventPayloadValidationError extends TypeError {
  readonly code = "RELKIT_EVENT_PAYLOAD_VALIDATION" as const;
  constructor(readonly issues: readonly StandardIssue[]) {
    super("Event payload validation failed");
    this.name = "EventPayloadValidationError";
  }
}

export class EventDependencyError extends Error {
  readonly code = "RELKIT_EVENT_DEPENDENCY_UNDECLARED" as const;
  constructor(readonly eventId: string) {
    super(`Event dependency "${eventId}" is not declared on this function`);
    this.name = "EventDependencyError";
  }
}

export class EventProfileError extends Error {
  readonly code = "RELKIT_EVENT_PROFILE_UNKNOWN" as const;
  constructor(readonly profile: string) {
    super(`Event profile "${profile}" is not configured`);
    this.name = "EventProfileError";
  }
}

export class EventProviderError extends Error {
  readonly code = "RELKIT_EVENT_PROVIDER_UNAVAILABLE" as const;
  constructor() {
    super("Event provider does not implement publish");
    this.name = "EventProviderError";
  }
}

export class EventOperationCancelledError extends Error {
  readonly code = "ABORT_ERR" as const;
  constructor() {
    super("Event operation cancelled");
    this.name = "AbortError";
  }
}

export class EventOperationTimeoutError extends Error {
  readonly code = "ETIMEDOUT" as const;
  constructor() {
    super("Event operation timed out");
    this.name = "TimeoutError";
  }
}

export async function parsePayload(
  schema: StandardSchemaV1 | undefined,
  payload: unknown,
): Promise<unknown> {
  if (schema === undefined) return payload;
  const result = await validate(schema, payload as never);
  if (result.issues !== undefined) throw new EventPayloadValidationError(result.issues);
  return result.value;
}

export function normalizeOptions(value: unknown): EventPublishOptions {
  if (!isRecord(value)) throw new TypeError("Event publish options must be an object");
  const key = value.key;
  assertOptionalText(key, "key");
  const attributes = value.attributes;
  if (attributes !== undefined && !isRecord(attributes))
    throw new TypeError("Event attributes must be an object");
  return Object.freeze({
    ...(key === undefined ? {} : { key: key as string }),
    ...(attributes === undefined ? {} : { attributes: normalizeAttributes(attributes) }),
  });
}

export function normalizeResult<Id extends string, Version extends number, Payload>(
  value: EventProviderResult | undefined,
  payload: Payload,
  options: EventPublishOptions,
  context: EventOperationContext,
  now: (() => Date) | undefined,
  eventId: Id,
  version: Version,
): EventPublishResult<Id, Version, Payload> {
  const metadata: Record<string, unknown> = isRecord(value) && value.accepted === true ? value : {};
  const timestamp = (now?.() ?? new Date()).toISOString();
  const key = text(metadata.key) ?? options.key;
  return Object.freeze({
    instanceId: text(metadata.instanceId) ?? `event-${crypto.randomUUID()}`,
    accepted: true as const,
    eventId,
    version,
    payload,
    occurredAt: text(metadata.occurredAt) ?? timestamp,
    publishedAt: text(metadata.publishedAt) ?? timestamp,
    ...(key === undefined ? {} : { key }),
    ...(context.propagation === undefined ? {} : { propagation: context.propagation }),
    attributes: normalizeAttributes(metadata.attributes ?? options.attributes ?? {}),
  });
}

export function resolveProvider(
  source: unknown,
  profile: string,
  resolveProfile: ((profile: string) => unknown) | undefined,
): EventProvider {
  const selected = resolveProfile?.(profile) ?? profileValue(source, profile);
  if (isProvider(selected)) return selected;
  if (selected === undefined) throw new EventProfileError(profile);
  throw new EventProviderError();
}

export function notify<T>(hook: ((value: T) => void) | undefined, value: T, enabled = true): void {
  if (!enabled) return;
  try {
    hook?.(Object.freeze(value));
  } catch {
    // Edge telemetry cannot replace publication or provider work.
  }
}

export function resolveValue(value: EventClientOptions["correlationId"]): string | undefined {
  return typeof value === "function" ? value() : value;
}

export function assertOptionalText(value: unknown, name: string): void {
  if (value !== undefined && (typeof value !== "string" || value.trim() === ""))
    throw new TypeError(`Event ${name} must be non-empty text`);
}

export function assertVersion(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError("Event version must be a positive integer");
}

function profileValue(source: unknown, profile: string): unknown {
  if (isProvider(source)) return source;
  const value = isRecord(source) && source.capability === "events" ? source.value : source;
  if (isProvider(value)) return value;
  return isRecord(value) ? value[profile] : undefined;
}

function normalizeAttributes(value: unknown): Readonly<Record<string, EventAttributeValue>> {
  if (!isRecord(value)) throw new TypeError("Event attributes must be an object");
  const result: Record<string, EventAttributeValue> = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (
      typeof item !== "string" &&
      typeof item !== "boolean" &&
      (typeof item !== "number" || !Number.isFinite(item))
    ) {
      throw new TypeError(`Event attribute "${key}" must be a string, finite number, or boolean`);
    }
    result[key] = item;
  }
  return Object.freeze(result);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isProvider(value: unknown): value is EventProvider {
  return isRecord(value) && typeof value.publish === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
