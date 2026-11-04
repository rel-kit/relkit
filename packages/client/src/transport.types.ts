import type { ClientLink, ClientOptions } from "@orpc/client";

/** Existing oRPC context retained without translating native error objects. */
export type TransportContext = Record<PropertyKey, unknown>;

/** One configured link-selection and invocation owner. */
export interface ClientTransportService {
  /** Selects the owned link and invokes one declared procedure.
   * @param path - Exact generated procedure path segments.
   * @param input - Original request payload passed to the native link.
   * @param options - Existing oRPC context, cancellation and request options.
   * @returns The native result, or the native rejection with its identity preserved. */
  readonly invoke: (
    path: string[],
    input: unknown,
    options: ClientOptions<TransportContext>,
  ) => Promise<unknown>;
  /** Aborts the selection and every in-flight invocation, then waits for them to settle.
   * @returns The same settlement Promise on repeated calls. */
  readonly close: () => Promise<void>;
}

/** Native link dependency supplied at transport acquisition. */
export type TransportLink = ClientLink<TransportContext>;

/**
 * Lazily chooses the native link once for a transport owner.
 * @param signal - Aborted when the owner closes; selection must release what it acquired.
 * @returns The selected native link.
 */
export type TransportSelection = (signal: AbortSignal) => Promise<TransportLink>;
