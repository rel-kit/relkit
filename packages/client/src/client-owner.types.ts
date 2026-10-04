import type { Effect } from "effect";

/**
 * Once-acquired domain context with independent asynchronous lifetime ownership.
 * @typeParam Shape - Service implementation captured at synchronous acquisition.
 */
export interface ClientOwner<Shape> {
  /** Stable service identity; invoking it does not acquire another Layer. */
  readonly service: Shape;
  /** Runs one child owned by this context and joins its scoped finalizers.
   * @typeParam A - Successful operation result.
   * @typeParam E - Original typed failure, preserved at the Promise boundary.
   * @param effect - Lazy resource-owning service workflow.
   * @returns The original result or rejection after child cleanup. */
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
  /** Interrupts active children and joins acquired-resource finalizers once.
   * @returns The same settlement Promise on concurrent or repeated closure. */
  readonly close: () => Promise<void>;
}
