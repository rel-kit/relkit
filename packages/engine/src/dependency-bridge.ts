import type { MaybePromise } from "@relkit/contracts";
import { normalizeFailure, type InvocationFailure } from "@relkit/invocation";
import { type InvocationBridge } from "@relkit/runtime-effect";
import { Effect } from "effect";
import type { DependencyBridge, DependencyBridgeOptions } from "./dependencies.js";

/** Adapt native capability calls to the configured shared invocation runtime.
 * @returns Native adapters preserving invocation tracing, cancellation and runner configuration.
 * @param bridge - Caller-owned invocation runner retaining trace context.
 * @param signal - Caller cancellation signal.
 */
export function createDependencyBridge(
  bridge: InvocationBridge,
  signal: AbortSignal,
): DependencyBridge {
  /** Execute a native provider call through the shared traced invocation bridge.
   * @typeParam A - Successful provider result.
   * @param operation - Native capability callback executed lazily by the bridge.
   * @param options - Span metadata and optional cancellation override.
   * @returns A Promise preserving the result and normalizing native provider failures.
   */
  const run = <A>(
    operation: () => MaybePromise<A>,
    options: DependencyBridgeOptions = {},
  ): Promise<A> =>
    bridge.run(
      Effect.tryPromise<A, InvocationFailure>({
        try: () => Promise.resolve(operation()),
        catch: (cause) =>
          normalizeFailure(cause, { source: "provider", signal: options.signal ?? signal }),
      }),
      {
        ...(options.name === undefined ? {} : { name: options.name }),
        ...(options.attributes === undefined ? {} : { attributes: options.attributes }),
        ...(options.kind === undefined ? {} : { kind: options.kind }),
        ...(options.input === undefined ? {} : { input: options.input }),
        signal: options.signal ?? signal,
      },
    );
  /** Execute a provider side effect and discard its successful return value.
   * @param operation - Native provider operation with no caller-visible result.
   * @param options - Span metadata and optional cancellation override.
   * @returns A Promise settling after the traced provider operation finishes.
   */
  const runVoid: DependencyBridge["runVoid"] = (operation, options) =>
    run<void>(operation, options).then(() => undefined);
  return Object.freeze({
    run: run as DependencyBridge["run"],
    runVoid,
  });
}
