import { Context, Effect, Layer, Semaphore } from "effect";
import { startCandidate, verifyCandidate, type CandidateOptions } from "@relkit/supervisor";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { ownedNativePromise } from "./owned-promise.js";
import type { DevSupervisorOperations } from "./dev-supervisor.types.js";

/** Explicit SDK authority for development generations and their stable proxy. */
export class CliDevSupervisor extends Context.Service<CliDevSupervisor, DevSupervisorOperations>()(
  "relkit/cli/DevSupervisor",
) {}

/**
 * Adapts individual public supervisor SDK calls without wrapping CLI orchestration.
 * @returns A lazy, replaceable native SDK Layer.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { createSupervisorProxy } from "@relkit/supervisor";
 * const proxy = createSupervisorProxy({ port: 0 });
 * await Effect.runPromise(CliDevSupervisor.use((sdk) => sdk.stopProxy(proxy)).pipe(Effect.provide(devSupervisorLayer)));
 * ```
 */
export const devSupervisorLayer = Layer.effect(
  CliDevSupervisor,
  Effect.sync(() => {
    const proxies = new WeakMap<
      Parameters<DevSupervisorOperations["listen"]>[0],
      Semaphore.Semaphore
    >();
    /**
     * Serializes a native listener mutation through its physical SDK receipt.
     * @param proxy - Session-owned stable listener.
     * @param operation - Single native SDK mutation.
     * @returns Lazy joined mutation; stop cannot finish before an admitted listen opens.
     */
    const listenerMutation = (
      proxy: Parameters<DevSupervisorOperations["listen"]>[0],
      operation: Effect.Effect<void, import("../cli-errors.js").CliAdapterError>,
    ) =>
      Effect.suspend(() => {
        const gate = proxies.get(proxy) ?? Semaphore.makeUnsafe(1);
        proxies.set(proxy, gate);
        return gate.withPermits(1)(operation).pipe(Effect.uninterruptible);
      });
    return CliDevSupervisor.of({
      start: (options) =>
        observeCli(
          "dev.candidate.start",
          ownedNativePromise("dev.candidate.start", (signal) =>
            startAcquiredCandidate(options, signal),
          ),
        ),
      verify: (options) =>
        observeCli(
          "dev.candidate.verify",
          ownedNativePromise("dev.candidate.verify", (signal) =>
            verifyCandidate({
              ...options,
              signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
            }),
          ).pipe(Effect.asVoid),
        ),
      dispose: (candidate) =>
        observeCli(
          "dev.candidate.dispose",
          cliPromise("dev.candidate.dispose", () => candidate.dispose()).pipe(
            Effect.uninterruptible,
          ),
        ),
      drain: (drain) =>
        observeCli(
          "dev.generation.drain",
          cliPromise("dev.generation.drain", () => drain.drain()).pipe(Effect.uninterruptible),
        ),
      listen: (proxy) =>
        observeCli(
          "dev.proxy.listen",
          listenerMutation(
            proxy,
            cliPromise("dev.proxy.listen", () => proxy.listen()).pipe(Effect.asVoid),
          ),
        ),
      stopProxy: (proxy) =>
        observeCli(
          "dev.proxy.stop",
          listenerMutation(
            proxy,
            cliPromise("dev.proxy.stop", () => proxy.stop()),
          ),
        ),
    } satisfies DevSupervisorOperations);
  }),
);

/**
 * Forwards cancellation only until the SDK transfers an acquired candidate to its stop owner.
 * @param options - Unpublished generation and the session's admission signal.
 * @param owned - Foreign acquisition cancellation, joined by the surrounding scope.
 * @returns Physical acquisition settlement after all temporary signal links are removed.
 * @remarks An acquired child receives termination through stop/dispose, avoiding a second SIGTERM.
 */
function startAcquiredCandidate(options: CandidateOptions, owned: AbortSignal) {
  const acquisition = new AbortController();
  const sources = options.signal === undefined ? [owned] : [owned, options.signal];
  const detach = sources.map((source) => {
    const forward = () => acquisition.abort(source.reason);
    if (source.aborted) forward();
    else source.addEventListener("abort", forward, { once: true });
    return () => source.removeEventListener("abort", forward);
  });
  return startCandidate({ ...options, signal: acquisition.signal }).finally(() => {
    for (const remove of detach) remove();
  });
}
