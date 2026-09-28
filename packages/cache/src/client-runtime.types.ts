import type { MaybePromise } from "@relkit/contracts";
import type { CacheClientOptions } from "./client.types.js";
import type { CacheProvider } from "./client-operation.types.js";
/** Metadata sent to an invocation bridge.
 * @example const options: CacheBridgeOptions = { name: "cache.get", attributes: {}, signal: new AbortController().signal };
 */
export interface CacheBridgeOptions {
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly input?: unknown;
}
/** Existing invocation bridge contract.
 * @example const bridge: CacheInvocationBridge = { run: async (operation) => operation() };
 */
export interface CacheInvocationBridge {
  /** Runs one operation in the existing invocation boundary.
   * @param operation - Deferred operation callback.
   * @param options - Span metadata, signal, and input.
   * @returns Operation value or rejection.
   * @example bridge.run(() => Promise.resolve(1));
   */
  readonly run: <A>(operation: () => MaybePromise<A>, options?: CacheBridgeOptions) => Promise<A>;
}
/** Provider and options supplied to cache Effect operations.
 * @example const runtime: CacheRuntimeService = { options, provider };
 */
export interface CacheRuntimeService {
  readonly options: CacheClientOptions;
  readonly provider: CacheProvider;
}
