import { observeExecution } from "@relkit/contracts/operation";
import { Cause, Deferred, Effect, Exit, Fiber, Scope } from "effect";
import { ownProxyBody } from "./proxy-body.js";
import { forwardProxyRequest } from "./proxy-forward.js";
import type { ProxyAdmission } from "./proxy.types.js";

/**
 * Owns one admitted generation through headers and the complete body lifetime.
 * @param request - Native request with caller-owned signal.
 * @param admission - Atomically selected target and drain lease.
 * @param fetcher - Replaceable native fetch capability.
 * @returns Headers promptly; its scoped worker completes only on body termination.
 */
export const proxyRequest = Effect.fn("SupervisorProxy.request")(function* (
  request: Request,
  admission: ProxyAdmission,
  fetcher: typeof fetch,
) {
  const scope = yield* Scope.fork(admission.scope);
  yield* Scope.addFinalizer(
    scope,
    Effect.sync(() => admission.lease?.release()),
  );
  const context = yield* Effect.context<never>();
  const headers = yield* Deferred.make<Response, unknown>();
  const completed = yield* Deferred.make<void, unknown>();
  const controller = new AbortController();
  yield* Scope.addFinalizer(
    scope,
    Effect.sync(() => {
      controller.abort(new Error("Supervisor proxy request closed."));
    }),
  );
  let worker: Fiber.Fiber<void, unknown> | undefined;
  const bodySignal = AbortSignal.any([
    controller.signal,
    request.signal,
    ...(admission.lease === undefined ? [] : [admission.lease.signal]),
  ]);
  /** Interrupts the owned request worker. @returns After requesting native boundary cancellation. */
  const abort = (): void => worker?.interruptUnsafe();
  bodySignal.addEventListener("abort", abort, { once: true });
  yield* Scope.addFinalizer(
    scope,
    Effect.sync(() => bodySignal.removeEventListener("abort", abort)),
  );
  const operation = observeExecution(
    "supervisor",
    "proxy.request",
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: (signal) =>
          forwardProxyRequest(
            request,
            admission.target,
            fetcher,
            admission.lease,
            AbortSignal.any([signal, controller.signal]),
          ),
        catch: (error) => error,
      });
      const owned = yield* ownProxyBody(response, {
        context,
        scope,
        completed,
        signal: bodySignal,
        join: () => (worker === undefined ? Effect.void : Fiber.await(worker)),
      });
      yield* Deferred.succeed(headers, owned);
      yield* Deferred.await(completed);
    }),
    () => ({ requests: 1 }),
  );
  worker = yield* Effect.forkIn(
    operation.pipe(
      Effect.interruptible,
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          if (Exit.isFailure(exit))
            yield* Deferred.done(
              headers,
              bodySignal.aborted && Cause.hasInterruptsOnly(exit.cause)
                ? Exit.fail(bodySignal.reason)
                : Exit.failCause(exit.cause),
            );
          yield* Scope.close(scope, exit);
        }),
      ),
    ),
    scope,
    { startImmediately: true },
  );
  if (bodySignal.aborted) worker.interruptUnsafe();
  return yield* Effect.interruptible(Deferred.await(headers)).pipe(
    Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
  );
}, Effect.uninterruptible);
