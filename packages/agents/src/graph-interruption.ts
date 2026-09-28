import type { JsonValue } from "@relkit/contracts";
import { Effect, Metric, Schema } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { GraphWaitingInterrupt } from "./graph-interruption.types.js";
import type { AgentWaitingRequest } from "./state.types.js";

export type { GraphWaitingInterrupt } from "./graph-interruption.types.js";

const responseCount = Metric.counter("relkit.agents.graph_interruption.response.total");
const responseFailures = Metric.counter("relkit.agents.graph_interruption.response.failure.total");
const requestsCount = Metric.counter("relkit.agents.graph_interruption.requests.total");
const predicateCount = Metric.counter("relkit.agents.graph_interruption.predicate.total");

/** No pending request is available to form a graph interruption response. */
export class GraphWaitingResponseError extends Schema.TaggedError<GraphWaitingResponseError>()(
  "GraphWaitingResponseError",
  { message: Schema.String },
) {}

/**
 * Combines pending graph responses into one JSON schema.
 *
 * @param interrupts - Pending interrupts in graph order.
 * @returns An Effect with the response schema or GraphWaitingResponseError.
 * @example
 * const response = Effect.runSync(graphWaitingResponseEffect([{ node: "review", response: true }]));
 */
export const graphWaitingResponseEffect = Effect.fn("Agents.graphInterruption.response")(
  function* (interrupts: readonly GraphWaitingInterrupt[]) {
    yield* Metric.update(responseCount, 1);
    const first = interrupts[0];
    if (first === undefined) {
      yield* Metric.update(responseFailures, 1);
      return yield* Effect.fail(
        new GraphWaitingResponseError({
          message: "Graph interruption has no pending requests",
        }),
      );
    }
    if (interrupts.length === 1) return first.response;
    return {
      type: "array",
      prefixItems: interrupts.map((entry) => entry.response),
      items: false,
      minItems: interrupts.length,
      maxItems: interrupts.length,
    } satisfies JsonValue;
  },
  (effect) => observeAgent("graph-interruption.response", effect),
);

/**
 * Combines pending graph responses for synchronous runtime callers.
 *
 * @param interrupts - Pending interrupts in graph order.
 * @returns The single response or ordered tuple schema.
 * @throws TypeError when no request is pending.
 * @example
 * const response = graphWaitingResponse([{ node: "review", response: true }]);
 */
export function graphWaitingResponse(interrupts: readonly GraphWaitingInterrupt[]): JsonValue {
  return Effect.runSync(
    graphWaitingResponseEffect(interrupts).pipe(
      Effect.catchTag("GraphWaitingResponseError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}

/**
 * Removes internal identifiers while retaining public waiting request order.
 *
 * @param interrupts - Pending graph interrupts.
 * @returns An Effect with public waiting requests; it has no typed failure.
 * @example
 * const requests = Effect.runSync(publicWaitingRequestsEffect(interrupts));
 */
export const publicWaitingRequestsEffect = Effect.fn("Agents.graphInterruption.requests")(
  function* (interrupts: readonly GraphWaitingInterrupt[]) {
    yield* Metric.update(requestsCount, 1);
    return interrupts.map(({ node, value, response }) => ({
      node,
      ...(value === undefined ? {} : { value }),
      response,
    }));
  },
  (effect) => observeAgent("graph-interruption.requests", effect),
);

/**
 * Returns public waiting requests for synchronous runtime callers.
 *
 * @param interrupts - Pending graph interrupts.
 * @returns Requests without internal interrupt IDs.
 * @example
 * const requests = publicWaitingRequests(interrupts);
 */
export function publicWaitingRequests(
  interrupts: readonly GraphWaitingInterrupt[],
): readonly AgentWaitingRequest[] {
  return Effect.runSync(publicWaitingRequestsEffect(interrupts));
}

/**
 * Internal control result used by the server to publish a durable waiting snapshot.
 *
 * @example
 * throw new GraphInterruptedError("thread-1", interrupts);
 */
export class GraphInterruptedError extends Error {
  readonly code = "RELKIT_GRAPH_INTERRUPTED" as const;

  constructor(
    readonly threadId: string,
    readonly interrupts: readonly GraphWaitingInterrupt[],
  ) {
    super("Graph execution is waiting for human input");
    this.name = "GraphInterruptedError";
  }
}

/**
 * Recognizes the internal graph interruption control result.
 *
 * @param value - Candidate error.
 * @returns An Effect with the recognition result; it has no typed failure.
 * @example
 * const interrupted = Effect.runSync(isGraphInterruptedErrorEffect(error));
 */
export const isGraphInterruptedErrorEffect = Effect.fn("Agents.graphInterruption.isError")(
  function* (value: unknown) {
    yield* Metric.update(predicateCount, 1);
    return value instanceof GraphInterruptedError;
  },
  (effect) => observeAgent("graph-interruption.is-error", effect),
);

/**
 * Recognizes graph interruption errors for synchronous callers.
 *
 * @param value - Candidate error.
 * @returns True only for a GraphInterruptedError instance.
 * @example
 * if (isGraphInterruptedError(error)) console.log(error.threadId);
 */
export function isGraphInterruptedError(value: unknown): value is GraphInterruptedError {
  return Effect.runSync(isGraphInterruptedErrorEffect(value));
}
