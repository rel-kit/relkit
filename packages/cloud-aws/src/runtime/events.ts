import type {
  EventOperationContext,
  EventProvider,
  EventProviderResult,
  EventPublishOptions,
} from "@relkit/events";
import type {
  EventInvocationContext,
  EventRuntimeProvider,
  EventTriggerBinding,
} from "@relkit/engine";
import type { EventNode } from "@relkit/graph";
import { assertResponse, awsRequest } from "./http.js";
import { type AwsCredentials, text } from "./config.js";

export interface AwsEventOptions {
  readonly region: string;
  readonly busName?: unknown;
  readonly source?: unknown;
  readonly endpoint?: unknown;
  readonly credentials?: AwsCredentials;
  readonly fetch?: typeof globalThis.fetch | undefined;
}

export interface AwsEventProvider extends EventProvider, EventRuntimeProvider {
  readonly deliver: (
    triggerId: string,
    envelope: unknown,
    context?: EventInvocationContext,
  ) => Promise<unknown>;
}

export function createEventBridgeProvider(options: AwsEventOptions): AwsEventProvider {
  const busName = text(options.busName, "AWS event busName");
  const source = text(options.source, "AWS event source") ?? "relkit.application";
  const endpoint =
    text(options.endpoint, "AWS EventBridge endpoint") ??
    `https://events.${options.region}.amazonaws.com`;
  const auth = options.credentials;
  const triggers = new Map<string, EventTriggerBinding>();
  const publish = async (
    payload: unknown,
    request: EventPublishOptions,
    context: EventOperationContext,
  ): Promise<EventProviderResult> => {
    if (context.signal.aborted)
      throw context.signal.reason ?? new Error("Event operation cancelled");
    if (busName === undefined) throw new Error("AWS event busName is not configured");
    const timestamp = new Date().toISOString();
    const envelope = {
      instanceId: `event-${crypto.randomUUID()}`,
      eventId: context.eventId,
      version: context.version,
      payload,
      occurredAt: timestamp,
      publishedAt: timestamp,
      ...(request.key === undefined ? {} : { key: request.key }),
      attributes: request.attributes ?? {},
      traceId: context.traceId,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      ...(context.causationInvocationId === undefined
        ? {}
        : { causationInvocationId: context.causationInvocationId }),
    };
    const response = await awsRequest(endpoint, {
      service: "events",
      region: options.region,
      credentials: auth,
      fetch: options.fetch,
      init: {
        method: "POST",
        signal: context.signal,
        headers: {
          "content-type": "application/x-amz-json-1.1",
          "x-amz-target": "AWSEvents.PutEvents",
        },
        body: JSON.stringify({
          Entries: [
            {
              EventBusName: busName,
              Source: source,
              DetailType: `${context.eventId}@${context.version}`,
              Detail: JSON.stringify(envelope),
            },
          ],
        }),
      },
    });
    await assertResponse(response, "EventBridge publish");
    const result = (await response.json()) as {
      readonly FailedEntryCount?: number;
      readonly Entries?: readonly { readonly EventId?: string; readonly ErrorCode?: string }[];
    };
    const entry = result.Entries?.[0];
    if (result.FailedEntryCount || entry?.ErrorCode || !entry?.EventId) {
      throw new Error(
        `EventBridge rejected event publication: ${entry?.ErrorCode ?? "invalid response"}`,
      );
    }
    return { ...envelope, accepted: true };
  };
  return Object.freeze({
    publish,
    registerContract: async (_contract: EventNode) => undefined,
    registerTrigger: async (binding: EventTriggerBinding) => {
      triggers.set(binding.id, binding);
    },
    deliver: async (triggerId: string, envelope: unknown, context: EventInvocationContext = {}) => {
      const binding = triggers.get(triggerId);
      if (binding === undefined)
        throw new Error(`AWS event trigger ${triggerId} is not registered`);
      return binding.invoke(envelope as never, context);
    },
  });
}
