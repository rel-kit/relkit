import type { Effect } from "effect";
import type {
  EventOperationContext,
  EventProvider,
  EventProviderResult,
  EventPublishOptions,
} from "../../events/index.js";
import type { LocalOperationError } from "../local-effect.js";
import type { EventRouter, EventRouterTrigger } from "./router-types.js";
import type {
  EventDeliveryContract,
  EventQueryContract,
  EventQueryRequest,
} from "./admin-contracts.js";

/** The answer of a replay: the publication it re-delivered and its new deliveries. */
export interface EventReplayResult {
  readonly replayOf: string;
  readonly eventId: string;
  readonly version: number;
  /** The publication's own instance id: a replay keeps the publication's identity. */
  readonly instanceId: string;
  readonly publishedAt: string;
  readonly deliveries: readonly { readonly triggerId: string; readonly deliveryId?: string }[];
}

/** A delivery id, or the Inspector's action request carrying it. */
type DeliveryTarget = string | { readonly deliveryId?: string };

/** A publication id, or the Inspector's replay request carrying it. */
type PublicationTarget = string | { readonly publicationId?: string };

/** Public event registration, publication and explicit close operations. */
export interface LocalEventProvider extends EventProvider {
  readonly registerContract: EventRouter["registerContract"];
  readonly registerTrigger: EventRouter["registerTrigger"];
  readonly query: (request?: EventQueryRequest) => Promise<EventQueryContract>;
  /** Runs a dead-lettered delivery again; answers its status. */
  readonly retry: (target: DeliveryTarget) => Promise<EventDeliveryContract>;
  /** Cancels a pending or scheduled delivery; answers its status. */
  readonly cancel: (target: DeliveryTarget) => Promise<EventDeliveryContract>;
  /** Delivers a stored publication again, as a replay, keeping its identity. */
  readonly replay: (target: PublicationTarget) => Promise<EventReplayResult>;
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
  readonly retry: (
    target: DeliveryTarget,
  ) => Effect.Effect<EventDeliveryContract, LocalOperationError>;
  readonly cancel: (
    target: DeliveryTarget,
  ) => Effect.Effect<EventDeliveryContract, LocalOperationError>;
  readonly replay: (
    target: PublicationTarget,
  ) => Effect.Effect<EventReplayResult, LocalOperationError>;
}
