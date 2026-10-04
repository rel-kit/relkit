import type { Effect } from "effect";
import type { EventDeliveryResult } from "@relkit/providers-local";
import type { TestEventCloseOptions } from "./events-types.js";
import type { EventProvider } from "@relkit/events";

/** Effect publication, delivery, inspection and lifecycle operations over native authorities. */
export interface EventControlsService {
  readonly publish: (
    ...args: Parameters<EventProvider["publish"]>
  ) => Effect.Effect<Awaited<ReturnType<EventProvider["publish"]>>, unknown>;
  readonly pending: (triggerId?: string) => Effect.Effect<number, unknown>;
  readonly completed: (triggerId?: string) => Effect.Effect<number, unknown>;
  readonly runNext: (triggerId?: string) => Effect.Effect<EventDeliveryResult | undefined, unknown>;
  readonly drain: Effect.Effect<readonly EventDeliveryResult[], unknown>;
  readonly restart: Effect.Effect<void, unknown>;
  readonly close: (options?: TestEventCloseOptions) => Effect.Effect<void, unknown>;
}
