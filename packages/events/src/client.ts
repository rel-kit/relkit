import { normalizeId, type MaybePromise } from "@zsys/contracts";
import type { EventAttributeValue, EventPublishOptions, EventPublishResult } from "@zsys/functions";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@zsys/schema";
import {
  EventDependencyError,
  EventOperationCancelledError,
  assertOptionalText,
  assertVersion,
  normalizeOptions,
  normalizeResult,
  notify,
  parsePayload,
  resolveProvider,
  resolveValue,
} from "./client-utils.js";
import { runAbortable } from "./client-operation.js";
export type { EventAttributeValue, EventPublishOptions, EventPublishResult } from "@zsys/functions";
export {
  EventDependencyError,
  EventOperationCancelledError,
  EventOperationTimeoutError,
  EventPayloadValidationError,
  EventProfileError,
  EventProviderError,
} from "./client-utils.js";
export interface EventOperationContext {
  readonly operation: "publish";
  readonly eventId: string;
  readonly version: number;
  readonly signal: AbortSignal;
  readonly profile: string;
  readonly deadlineMs?: number;
  readonly correlationId?: string;
  readonly causationInvocationId?: string;
  readonly traceId: string;
}
export type EventProviderResult<
  Id extends string = string,
  Version extends number = number,
  Payload = unknown,
> = Pick<EventPublishResult<Id, Version, Payload>, "instanceId" | "accepted"> &
  Partial<Omit<EventPublishResult<Id, Version, Payload>, "instanceId" | "accepted">>;

export interface EventProvider {
  readonly publish: (
    payload: unknown,
    options: EventPublishOptions,
    context: EventOperationContext,
  ) => MaybePromise<EventProviderResult>;
}

export interface EventInvocationBridgeOptions {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

export interface EventInvocationBridge {
  readonly run: <A>(
    operation: () => MaybePromise<A>,
    options?: EventInvocationBridgeOptions,
  ) => Promise<A>;
}

export interface EventClientOptions<
  Id extends string = string,
  Version extends number = number,
  PayloadSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly ownerId: string;
  readonly eventId: Id;
  readonly version: Version;
  readonly source: unknown;
  readonly payloadSchema?: PayloadSchema;
  readonly profile?: string;
  readonly resolveProfile?: (profile: string) => unknown;
  readonly bridge?: EventInvocationBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly correlationId?: string | (() => string | undefined);
  readonly causationInvocationId?: string | (() => string | undefined);
  readonly traceId?: string | (() => string | undefined);
  readonly now?: () => Date;
  readonly declared?: boolean;
  readonly onDeclaredEdge?: (edge: EventDeclaredEdge) => void;
  readonly onObservedEdge?: (edge: EventObservedEdge) => void;
}

export interface EventClient<
  Input = unknown,
  Id extends string = string,
  Version extends number = number,
  Payload = Input,
> {
  readonly publish: (
    payload: Input,
    options?: EventPublishOptions,
  ) => Promise<EventPublishResult<Id, Version, Payload>>;
}

export interface EventDeclaredEdge {
  readonly kind: "publishes-event";
  readonly from: string;
  readonly to: string;
}

export interface EventObservedEdge {
  readonly relationship: "publishes-event";
  readonly from: string;
  readonly to: string;
}

export function createEventClient<
  const Id extends string,
  const Version extends number,
  const PayloadSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: EventClientOptions<Id, Version, PayloadSchema>,
): EventClient<InferInput<PayloadSchema>, Id, Version, InferOutput<PayloadSchema>> {
  const ownerId = normalizeId(options.ownerId);
  const eventId = normalizeId(options.eventId) as unknown as Id;
  const version = options.version;
  assertVersion(version);
  const profile = normalizeId(options.profile ?? "default");
  const declared = options.declared !== false;
  const provider = declared
    ? resolveProvider(options.source, profile, options.resolveProfile)
    : ({} as EventProvider);
  notify(options.onDeclaredEdge, { kind: "publishes-event", from: ownerId, to: eventId }, declared);

  const publish = async (
    payload: InferInput<PayloadSchema>,
    request: EventPublishOptions = {},
  ): Promise<EventPublishResult<Id, Version, InferOutput<PayloadSchema>>> => {
    const publishOptions = normalizeOptions(request);
    const signal = options.signal?.() ?? new AbortController().signal;
    const deadlineMs = options.deadline?.();
    const correlationId = resolveValue(options.correlationId);
    const causationInvocationId = resolveValue(options.causationInvocationId);
    const traceId = resolveValue(options.traceId) ?? `trace-${crypto.randomUUID()}`;
    assertOptionalText(correlationId, "correlationId");
    assertOptionalText(causationInvocationId, "causationInvocationId");
    assertOptionalText(traceId, "traceId");
    notify(
      options.onObservedEdge,
      { relationship: "publishes-event", from: ownerId, to: eventId },
      declared,
    );
    const context = Object.freeze({
      operation: "publish" as const,
      eventId,
      version,
      signal,
      profile,
      ...(deadlineMs === undefined ? {} : { deadlineMs }),
      ...(correlationId === undefined ? {} : { correlationId }),
      ...(causationInvocationId === undefined ? {} : { causationInvocationId }),
      traceId,
    });
    const work = async (): Promise<EventPublishResult<Id, Version, InferOutput<PayloadSchema>>> => {
      if (!declared) throw new EventDependencyError(eventId);
      if (signal.aborted) throw new EventOperationCancelledError();
      const value = await parsePayload(options.payloadSchema, payload);
      const result = await provider.publish(value, publishOptions, context);
      return normalizeResult(
        result,
        value as InferOutput<PayloadSchema>,
        publishOptions,
        context,
        options.now,
        eventId,
        version,
      );
    };
    const bridged = options.bridge?.run(work, {
      name: `zsys.event.${eventId}.publish`,
      attributes: {
        "zsys.event.id": eventId,
        "zsys.event.version": version,
        "zsys.event.profile": profile,
      },
      signal,
    });
    return bridged === undefined ? runAbortable(signal, deadlineMs, work) : bridged;
  };
  return Object.freeze({ publish }) as EventClient<
    InferInput<PayloadSchema>,
    Id,
    Version,
    InferOutput<PayloadSchema>
  >;
}
