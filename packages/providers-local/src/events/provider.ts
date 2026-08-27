import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  EventOperationContext,
  EventProvider,
  EventProviderResult,
  EventPublishOptions,
} from "@relkit/events";
import type { EventRouter, EventRouterTrigger } from "./router-types.js";
import { createEventLog } from "./log.js";
import { createEventRouter } from "./router.js";

export interface LocalEventProvider extends EventProvider {
  readonly registerContract: EventRouter["registerContract"];
  readonly registerTrigger: EventRouter["registerTrigger"];
  readonly close: () => Promise<void>;
}

export async function createLocalEventProvider(root: string): Promise<LocalEventProvider> {
  const log = await createEventLog(join(root, "log"));
  const router = await createEventRouter(join(root, "router"));

  return Object.freeze({
    registerContract: router.registerContract,
    registerTrigger: (binding: EventRouterTrigger) => router.registerTrigger(binding),
    publish: async (
      payload: unknown,
      options: EventPublishOptions,
      context: EventOperationContext,
    ): Promise<EventProviderResult> => {
      const timestamp = new Date().toISOString();
      const record = await log.append({
        instanceId: `event-${randomUUID()}`,
        eventId: context.eventId,
        version: context.version,
        payload,
        occurredAt: timestamp,
        publishedAt: timestamp,
        ...(options.key === undefined ? {} : { key: options.key }),
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
        ...(context.causationInvocationId === undefined
          ? {}
          : { causationInvocationId: context.causationInvocationId }),
        traceId: context.traceId,
        attributes: options.attributes ?? {},
      });
      await router.route(record);
      return { accepted: true, ...record.envelope };
    },
    close: async () => {
      await router.close();
      await log.close();
    },
  });
}
