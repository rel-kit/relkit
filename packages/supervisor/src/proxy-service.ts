import { Context, Effect, Layer, Ref, Result, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { drainResponse } from "./proxy-forward.js";
import { proxyRequest } from "./proxy-request.js";
import { normalizeTarget, sameToken } from "./proxy-validation.js";
import type { ProxyState, SupervisorProxyOptions, SupervisorProxyService } from "./proxy.types.js";

/** Atomic proxy admission and owned forwarding service. */
export class SupervisorProxyOwner extends Context.Service<
  SupervisorProxyOwner,
  SupervisorProxyService
>()("@relkit/supervisor/SupervisorProxyOwner") {}

/**
 * Acquires atomic target state and one request parent scope, without opening sockets.
 * @param options - Native capabilities and public proxy configuration.
 * @param defaultHostname - Default private generation host.
 * @returns A substitutable scoped proxy service layer.
 */
export function createProxyLayer(options: SupervisorProxyOptions, defaultHostname: string) {
  return Layer.effect(
    SupervisorProxyOwner,
    Effect.gen(function* () {
      const owner = yield* Scope.Scope;
      const requests = yield* Scope.fork(owner);
      const state = yield* Ref.make<ProxyState>({ target: undefined, requests, stopping: false });
      const admit = Effect.sync(() => {
        const current = Ref.getUnsafe(state);
        if (current.stopping || current.target === undefined) return undefined;
        const lease = options.track?.(current.target.token);
        if (options.track !== undefined && lease === undefined) return undefined;
        return { target: current.target, lease, scope: current.requests };
      });
      return SupervisorProxyOwner.of({
        target: Ref.get(state).pipe(Effect.map((value) => value.target)),
        admit,
        compareAndSwitch: (expected, next) =>
          observeExecution(
            "supervisor",
            "proxy.switch",
            Ref.modify(
              state,
              (current): readonly [Effect.Effect<boolean, TypeError | RangeError>, ProxyState] => {
                if (current.stopping || !sameToken(current.target?.token, expected))
                  return [Effect.succeed(false), current];
                const normalized = Result.try({
                  try: () => normalizeTarget(next, defaultHostname),
                  catch: (error) => {
                    if (error instanceof TypeError || error instanceof RangeError) return error;
                    throw error;
                  },
                });
                if (Result.isFailure(normalized)) return [Effect.fail(normalized.failure), current];
                const target = normalized.success;
                if (
                  current.target !== undefined &&
                  (target.token.sourceToken <= current.target.token.sourceToken ||
                    target.token.generationToken <= current.target.token.generationToken)
                )
                  return [Effect.succeed(false), current];
                return [Effect.succeed(true), { ...current, target }];
              },
            ).pipe(Effect.flatten),
            () => ({ generations: 1 }),
          ),
        handle: Effect.fn("SupervisorProxy.handle")(function* (request: Request) {
          const intercepted = options.intercept?.(request);
          if (intercepted !== undefined)
            return yield* Effect.interruptible(
              observeExecution(
                "supervisor",
                "proxy.intercept",
                Effect.tryPromise({ try: () => intercepted, catch: (error) => error }),
                () => ({ requests: 1 }),
              ),
            );
          const selected = yield* admit;
          if (selected !== undefined)
            return yield* proxyRequest(request, selected, options.fetch ?? fetch);
          if (Ref.getUnsafe(state).target !== undefined) return drainResponse();
          return new Response(JSON.stringify({ error: "No active RelKit generation." }), {
            status: 503,
            headers: { "cache-control": "no-store", "content-type": "application/json" },
          });
        }, Effect.uninterruptible),
        stopAdmission: Ref.modify(state, (current) => [
          current.requests,
          {
            ...current,
            target: undefined,
            stopping: true,
          },
        ]),
        finishStop: Effect.gen(function* () {
          const next = yield* Scope.fork(owner);
          yield* Ref.update(state, (current) => ({ ...current, requests: next, stopping: false }));
        }),
      });
    }),
  );
}
