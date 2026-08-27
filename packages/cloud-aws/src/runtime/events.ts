import type { EventOperationContext, EventProvider, EventProviderResult } from "@relkit/events";
import type { EventRuntimeProvider, EventTriggerBinding } from "@relkit/engine";
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
  readonly deliver: (triggerId: string, envelope: unknown) => Promise<unknown>;
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
    request: { readonly key?: string; readonly attributes?: Record<string, unknown> },
    context: EventOperationContext,
  ): Promise<EventProviderResult> => {
    if (context.signal.aborted)
      throw context.signal.reason ?? new Error("Event operation cancelled");
    if (busName === undefined) throw new Error("AWS event busName is not configured");
    const detail = JSON.stringify({
      eventId: context.eventId,
      version: context.version,
      payload,
      key: request.key,
      attributes: request.attributes,
      traceId: context.traceId,
      correlationId: context.correlationId,
      causationInvocationId: context.causationInvocationId,
    });
    const response = await awsRequest(endpoint, {
      service: "events",
      region: options.region,
      credentials: auth,
      fetch: options.fetch,
      init: {
        method: "POST",
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
              Detail: detail,
            },
          ],
        }),
      },
    });
    await assertResponse(response, "EventBridge publish");
    const result = (await response.json()) as {
      readonly Entries?: readonly { readonly EventId?: string }[];
    };
    return {
      instanceId: result.Entries?.[0]?.EventId ?? `event-${crypto.randomUUID()}`,
      accepted: true,
    };
  };
  return Object.freeze({
    publish,
    registerContract: async (_contract: EventNode) => undefined,
    registerTrigger: async (binding: EventTriggerBinding) => {
      triggers.set(binding.id, binding);
    },
    deliver: async (triggerId: string, envelope: unknown) => {
      const binding = triggers.get(triggerId);
      if (binding === undefined)
        throw new Error(`AWS event trigger ${triggerId} is not registered`);
      return binding.invoke(envelope as never);
    },
  });
}
