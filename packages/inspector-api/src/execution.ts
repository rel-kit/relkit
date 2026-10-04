import { Effect, Exit, Layer, ManagedRuntime, Metric } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect";
import { redactRecord } from "@relkit/observability";
import type { InspectorExecutionOwner, InspectorLoggingOptions } from "./execution.types.js";
import { nativeAttempt, runInspectorPromise } from "./native-edge.js";

const owners = new WeakMap<object, Set<InspectorExecutionOwner>>();
const retirements = new WeakMap<object, Promise<void>>();

/**
 * Provides configured server logging and an owner-local metric registry.
 * @param options - Application sinks and admission threshold, acquired once per owner.
 * @returns A logger layer with redacted structured records and the configured admission level.
 * @remarks The collector belongs to this logger; it is never an Inspector query source.
 */
export function inspectorLoggerLayer(options: InspectorLoggingOptions = {}) {
  return Layer.mergeAll(
    createLoggerLayer({
      component: "inspector",
      ...options,
      redact: (record) =>
        redactRecord(options.redact?.(record) ?? record) as unknown as typeof record,
    }),
    Layer.sync(Metric.MetricRegistry, () => new Map()),
  );
}

/**
 * Compatibility owner for independently callable finite Inspector operations.
 * @remarks It acquires no native listeners or background workers. Router services
 * have a separate explicit owner and streams always have response-owned scopes.
 */
export const inspectorExecution = ManagedRuntime.make(Layer.mergeAll(inspectorLoggerLayer()));

/**
 * Retains an installed owner until its router is retired.
 * @param router - Native router identity; weak ownership permits unused routers to be collected.
 * @param owner - Reused service runtime associated with the installation.
 * @returns No value; registering the same owner twice is harmless.
 */
export function registerInspectorOwner(router: object, owner: InspectorExecutionOwner): void {
  retirements.delete(router);
  const installed = owners.get(router) ?? new Set();
  installed.add(owner);
  owners.set(router, installed);
}

/**
 * Finalizes all service owners registered on a retired router.
 * @param router - Native router identity.
 * @returns Completion after every owner finalizes; repeated calls are harmless.
 */
export async function disposeInspectorOwners(router: object): Promise<void> {
  const pending = retirements.get(router);
  if (pending !== undefined) return pending;
  const installed = owners.get(router);
  owners.delete(router);
  const disposal = runInspectorPromise(
    inspectorExecution,
    disposeOwnersEffect([...(installed ?? [])]),
  );
  retirements.set(router, disposal);
  return disposal;
}

/**
 * Waits for every registered native owner to finalize, even when one fails.
 * @param installed - Finite set of service owners registered on the retired router.
 * @returns Completion after all finalizers; the first native failure retains its identity.
 */
const disposeOwnersEffect = Effect.fn("InspectorOwners.dispose")(
  function* (installed: readonly InspectorExecutionOwner[]) {
    const exits = yield* Effect.forEach(
      installed,
      (owner) => nativeAttempt(() => owner.dispose()).pipe(Effect.exit),
      { concurrency: 4 },
    );
    for (const exit of exits) if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
  },
  (effect, installed) =>
    observeExecution("inspector", "owner.dispose", effect, () => ({ owners: installed.length })),
);
