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
  const pending = new Set<Promise<unknown>>();
  let workerError: unknown;
  let closed = false;
  const tick = (): void => {
    if (closed || workerError !== undefined) return;
    try {
      for (const trigger of router.snapshot().triggers) {
        if (trigger.delivery !== "durable") continue;
        const work = router.runNext(trigger.id).catch((error) => {
          workerError = error;
        });
        pending.add(work);
        void work.finally(() => pending.delete(work));
      }
    } catch (error) {
      workerError = error;
    }
  };
  const worker = setInterval(tick, 100);
  worker.unref();

  return Object.freeze({
    registerContract: router.registerContract,
    registerTrigger: (binding: EventRouterTrigger) => router.registerTrigger(binding),
    publish: async (
      payload: unknown,
      options: EventPublishOptions,
      context: EventOperationContext,
    ): Promise<EventProviderResult> => {
      if (closed) throw new Error("Event provider is closed");
      if (workerError !== undefined) throw workerError;
      const timestamp = new Date().toISOString();
      const record = await log.append({
        instanceId: `event-${randomUUID()}`,
        eventId: context.eventId,
        version: context.version,
        payload,
        occurredAt: timestamp,
        publishedAt: timestamp,
        ...(options.key === undefined ? {} : { key: options.key }),
        ...(context.propagation === undefined ? {} : { propagation: context.propagation }),
        attributes: options.attributes ?? {},
      });
      const fanout = await router.route(record, { run: false });
      const failed = fanout.deliveries.find(
        (delivery) => delivery.delivery === "durable" && !delivery.accepted,
      );
      if (failed !== undefined)
        throw failed.error ?? new Error("Event delivery could not be persisted");
      queueMicrotask(tick);
      return { accepted: true, ...record.envelope };
    },
    close: async () => {
      closed = true;
      clearInterval(worker);
      await Promise.all(pending);
      await router.close();
      await log.close();
      if (workerError !== undefined) throw workerError;
    },
  });
}
