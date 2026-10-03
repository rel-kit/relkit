import type { Effect } from "effect";
import type {
  EventOperationContext,
  EventProvider,
  EventProviderResult,
  EventPublishOptions,
} from "@relkit/events";
import type { LocalOperationError } from "../local-effect.js";
import type { EventRouter, EventRouterTrigger } from "./router-types.js";
import type { EventQueryContract, EventQueryRequest } from "./admin-contracts.js";

/** Public event registration, publication and explicit close operations. */
export interface LocalEventProvider extends EventProvider {
  readonly registerContract: EventRouter["registerContract"];
  readonly registerTrigger: EventRouter["registerTrigger"];
  readonly query: (request?: EventQueryRequest) => Promise<EventQueryContract>;
  readonly close: () => Promise<void>;
}

/** Effect event methods owned by the provider scope. */
export interface LocalEventEffects {
  readonly query: (
    request?: EventQueryRequest,
  ) => Effect.Effect<EventQueryContract, LocalOperationError>;
  readonly registerContract: (contract: unknown) => Effect.Effect<void, LocalOperationError>;
  readonly registerTrigger: (
    binding: EventRouterTrigger,
  ) => Effect.Effect<void, LocalOperationError>;
  readonly publish: (
    payload: unknown,
    options: EventPublishOptions,
    context: EventOperationContext,
  ) => Effect.Effect<EventProviderResult, LocalOperationError>;
  readonly health: () => Effect.Effect<void, LocalOperationError>;
}
