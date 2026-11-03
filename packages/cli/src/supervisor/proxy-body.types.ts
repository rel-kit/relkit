import type { Context, Deferred, Effect, Scope } from "effect";

/** Captured request scope/context and completion barrier for native byte-stream adaptation. */
export interface ProxyBodyOptions {
  readonly context: Context.Context<never>;
  readonly scope: Scope.Closeable;
  readonly completed: Deferred.Deferred<void, unknown>;
  /** Joins the request worker after body termination. @returns Its complete outcome without claiming caller cancellation. */
  readonly join: () => Effect.Effect<unknown>;
  readonly signal: AbortSignal;
}
