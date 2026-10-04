import { Context, Effect, Exit, Fiber, Layer, Scope } from "effect";
import { runClient, runClientSync } from "./client-runtime.js";
import type { ClientOwner } from "./client-owner.types.js";

/**
 * Acquires one synchronous Layer context and an independently closable fiber scope.
 * @typeParam Service - Service identifier supplied by the Layer.
 * @typeParam Shape - Service value.
 * @param layer - Complete synchronously acquirable domain Layer.
 * @param key - Service to retrieve from this owner's isolated context.
 * @returns A service owner reusing the resource-free runner without rebuilding Layers.
 * @remarks Each owner has its own Scope and context. Every asynchronous call forks
 * in a detachable child Scope; close interrupts and joins all owned work.
 * Synchronous acquisition accepts resource-free state Layers. Native resources
 * are acquired later by scoped operations, whose completion close joins.
 */
export function acquireClientOwner<Service, Shape>(
  layer: Layer.Layer<Service>,
  key: Context.Key<Service, Shape>,
): ClientOwner<Shape> {
  const scope = Scope.makeUnsafe();
  try {
    const context = runClientSync(Layer.buildWithScope(layer, scope));
    const service = Context.get(context, key);
    let closing: Promise<void> | undefined;
    return {
      service,
      run: (effect) =>
        runClient(
          Effect.withFiber((fiber) => {
            if (scope.state._tag === "Closed") return Effect.interrupt;
            const operation = Scope.forkUnsafe(scope);
            return Scope.addFinalizer(
              operation,
              Effect.withFiber((closing) =>
                closing.id === fiber.id ? Effect.void : Fiber.interrupt(fiber),
              ),
            ).pipe(Effect.andThen(effect), Effect.ensuring(Scope.close(operation, Exit.void)));
          }).pipe(Effect.provideContext(context)),
        ),
      close: () => (closing ??= runClient(Scope.close(scope, Exit.void))),
    };
  } catch (error) {
    // Start cleanup of an acquired prefix even if a synchronous Layer defects.
    // Native resources must be acquired by operations, never this sync boundary.
    const cleanup = Scope.closeUnsafe(scope, Exit.die(error));
    if (cleanup !== undefined) void runClient(cleanup).catch(() => undefined);
    throw error;
  }
}
