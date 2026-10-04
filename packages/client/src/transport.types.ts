import type { ClientLink, ClientOptions } from "@orpc/client";
import type { Effect } from "effect";

/** Existing oRPC context retained without translating native error objects. */
export type TransportContext = Record<PropertyKey, unknown>;

/** One configured link-selection and invocation owner. */
export interface ClientTransportService {
  /** Selects the owned link and invokes one declared procedure.
   * @param path - Exact generated procedure path segments.
   * @param input - Original request payload passed to the native link.
   * @param options - Existing oRPC context, cancellation and request options.
   * @returns A lazy observed invocation preserving the native result and error identity. */
  readonly invoke: (
    path: string[],
    input: unknown,
    options: ClientOptions<TransportContext>,
  ) => Effect.Effect<unknown, unknown>;
}

/** Native link dependency supplied at transport acquisition. */
export type TransportLink = ClientLink<TransportContext>;
