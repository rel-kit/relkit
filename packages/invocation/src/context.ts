import type { MaybePromise } from "@zsys/contracts";
import type { InvocationContextOptions, InvocationRecord, PublicClock } from "./contracts.js";

export function makeContext<Context extends { readonly signal: AbortSignal }>(
  factory: ((options: InvocationContextOptions) => MaybePromise<Context>) | undefined,
  record: InvocationRecord,
  signal: AbortSignal,
  env: Readonly<Record<string, unknown>>,
  time: PublicClock,
): Promise<Context> {
  const options = { invocation: record, signal, env: Object.freeze({ ...env }), time };
  if (factory !== undefined) return Promise.resolve(factory(options) as Context);
  const noop = (): void => undefined;
  return Promise.resolve(
    Object.freeze({
      invocation: record,
      signal,
      env: options.env,
      log: Object.freeze({ trace: noop, debug: noop, info: noop, warn: noop, error: noop }),
      time,
      jobs: Object.freeze({}),
      events: Object.freeze({}),
      buckets: Object.freeze({}),
      cache: Object.freeze({}),
      agents: Object.freeze({}),
      service: Object.freeze({}),
    }) as unknown as Context,
  );
}

export function linkSignals(
  controller: AbortController,
  signals: readonly (AbortSignal | undefined)[],
): () => void {
  const listeners: Array<readonly [AbortSignal, () => void]> = [];
  for (const signal of signals) {
    if (signal === undefined) continue;
    const abort = (): void => controller.abort(signal.reason);
    if (signal.aborted) abort();
    else {
      signal.addEventListener("abort", abort, { once: true });
      listeners.push([signal, abort]);
    }
  }
  return () => listeners.forEach(([signal, abort]) => signal.removeEventListener("abort", abort));
}
