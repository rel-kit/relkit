import type {
  ObservabilityStreamEventType,
  ObservabilityStreamOverflow,
  ObservabilityStreamSubscriptionOptions,
} from "@relkit/observability";

/** Native SSE replay cursor, type filter and bounded live feed buffer request. */
export type StreamRequest = Omit<
  ObservabilityStreamSubscriptionOptions,
  "overflow" | "backpressure"
> & {
  readonly overflow?: ObservabilityStreamOverflow;
  readonly backpressure?: ObservabilityStreamOverflow;
  readonly type?: ObservabilityStreamEventType;
};
