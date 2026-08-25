import { Effect } from "effect";
import type { MaybePromise } from "@zsys/contracts";
import { normalizeFailure, type InvocationFailure } from "@zsys/invocation";
import { type InvocationBridge } from "@zsys/runtime-effect";
import type { DependencyBridge, DependencyBridgeOptions } from "./dependencies.js";

export function createDependencyBridge(
  bridge: InvocationBridge,
  signal: AbortSignal,
): DependencyBridge {
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
        signal: options.signal ?? signal,
      },
    );
  const runVoid: DependencyBridge["runVoid"] = (operation, options) =>
    run<void>(operation, options).then(() => undefined);
  return Object.freeze({
    run: run as DependencyBridge["run"],
    runVoid,
  });
}
