import { normalizeId, type MaybePromise, type TracePropagation } from "@relkit/contracts";
import { currentTracePropagation, frameworkTrace } from "@relkit/invocation";
import type { EventPublishOptions, EventPublishResult } from "@relkit/functions";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";
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
export type {
  EventAttributeValue,
  EventPublishOptions,
  EventPublishResult,
} from "@relkit/functions";
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
  readonly propagation?: TracePropagation;
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
  readonly kind?: "producer";
  readonly input?: unknown;
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
    assertOptionalText(correlationId, "correlationId");
    notify(
      options.onObservedEdge,
      { relationship: "publishes-event", from: ownerId, to: eventId },
      declared,
    );
    const work = async (): Promise<EventPublishResult<Id, Version, InferOutput<PayloadSchema>>> => {
      if (!declared) throw new EventDependencyError(eventId);
      if (signal.aborted) throw new EventOperationCancelledError();
      const value = await parsePayload(options.payloadSchema, payload);
      const propagation = currentTracePropagation();
      const context = Object.freeze({
        operation: "publish" as const,
        eventId,
        version,
        signal,
        profile,
        ...(deadlineMs === undefined ? {} : { deadlineMs }),
        ...(propagation === undefined ? {} : { propagation }),
      });
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
      name: `relkit.event.${eventId}.publish`,
      attributes: {
        "relkit.event.id": eventId,
        "relkit.event.version": version,
        "relkit.event.profile": profile,
      },
      input: payload,
      signal,
      kind: "producer",
    });
    return bridged === undefined
      ? frameworkTrace.span(
          `relkit.event.${eventId}.publish`,
          {
            input: payload,
            kind: "producer",
            attributes: {
              "relkit.event.id": eventId,
              "relkit.event.version": version,
              "relkit.event.profile": profile,
            },
          },
          () => runAbortable(signal, deadlineMs, work),
        )
      : bridged;
  };
  return Object.freeze({ publish }) as EventClient<
    InferInput<PayloadSchema>,
    Id,
    Version,
    InferOutput<PayloadSchema>
  >;
}
