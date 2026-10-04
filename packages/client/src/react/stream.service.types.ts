import type { Effect } from "effect";
/** Declared procedure observation with borrowed external-store callbacks. */
export interface ClientStreamService {
  /** Owns declared native pulls and external-store publication until cancellation.
   * @param client - Borrowed generated transport.
   * @param name - Exact declared procedure key.
   * @param input - Original request payload.
   * @param signal - View lifetime propagated to the native transport.
   * @param opened - Synchronous establishment publication.
   * @param publish - Isolated synchronous item publication.
   * @returns A lazy scoped observation preserving native errors and joining cleanup. */
  readonly consume: (
    client: unknown,
    name: string,
    input: unknown,
    signal: AbortSignal,
    opened: () => void,
    publish: (item: unknown) => void,
  ) => Effect.Effect<void, unknown>;
}
