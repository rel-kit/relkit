import type { JsonValue } from "@relkit/contracts";
import type { AgentWaitingRequest } from "./state-types.js";

export interface GraphWaitingInterrupt {
  readonly id?: string;
  readonly node: string;
  readonly value?: unknown;
  readonly response: JsonValue;
}

export function graphWaitingResponse(interrupts: readonly GraphWaitingInterrupt[]): JsonValue {
  if (interrupts.length === 0) throw new TypeError("Graph interruption has no pending requests");
  if (interrupts.length === 1) return interrupts[0]!.response;
  return {
    type: "array",
    prefixItems: interrupts.map((entry) => entry.response),
    items: false,
    minItems: interrupts.length,
    maxItems: interrupts.length,
  };
}

export function publicWaitingRequests(
  interrupts: readonly GraphWaitingInterrupt[],
): readonly AgentWaitingRequest[] {
  return interrupts.map(({ node, value, response }) => ({
    node,
    ...(value === undefined ? {} : { value }),
    response,
  }));
}

/** Internal control result used by the server to publish a durable waiting snapshot. */
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

export function isGraphInterruptedError(value: unknown): value is GraphInterruptedError {
  return value instanceof GraphInterruptedError;
}
