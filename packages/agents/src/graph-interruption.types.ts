import type { JsonValue } from "@relkit/contracts";

/**
 * Pending graph interruption and its public response schema.
 * The optional ID is internal and omitted from published waiting requests.
 *
 * @example
 * const interrupt: GraphWaitingInterrupt = { node: "review", response: true };
 */
export interface GraphWaitingInterrupt {
  readonly id?: string;
  readonly node: string;
  readonly value?: unknown;
  readonly response: JsonValue;
}
