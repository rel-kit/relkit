import type { MaybePromise } from "@relkit/contracts";
import type {
  BucketObjectMetadata,
  BucketOperation,
  BucketPutOptions,
} from "./client-provider.types.js";

export type * from "./client-provider.types.js";

/** Bounded outcome classification emitted to observation hooks. */
export type BucketOperationOutcome =
  "success" | "provider-failure" | "cancelled" | "timeout" | "unsupported";
/** Promise adapter used by existing RELKIT application code.
 * @example await client.get("images/logo.png");
 */
export interface BucketClient {
  /** Store content.
   * @param key - Portable key.
   * @param bytes - Content.
   * @param options - Optional metadata.
   * @returns Completion Promise or provider failure.
   * @example await client.put("a", new Uint8Array());
   */
  put(key: string, bytes: Uint8Array, options?: BucketPutOptions): Promise<void>;
  /** Read content.
   * @param key - Portable key.
   * @returns Bytes or undefined, or a rejected Promise.
   * @example await client.get("a");
   */
  get(key: string): Promise<Uint8Array | undefined>;
  /** Read metadata.
   * @param key - Portable key.
   * @returns Metadata or undefined, or a rejected Promise.
   * @example await client.head("a");
   */
  head(key: string): Promise<BucketObjectMetadata | undefined>;
  /** Delete content.
   * @param key - Portable key.
   * @returns Completion Promise or provider failure.
   * @example await client.delete("a");
   */
  delete(key: string): Promise<void>;
  /** Test for a key.
   * @param key - Portable key.
   * @returns Existence flag or a rejected Promise.
   * @example await client.exists("a");
   */
  exists(key: string): Promise<boolean>;
  /** List keys in provider order.
   * @param prefix - Optional portable prefix.
   * @returns Keys or a rejected Promise.
   * @example await client.list("images/");
   */
  list(prefix?: string): Promise<readonly string[]>;
  /** Request a signed download URL.
   * @param key - Portable key.
   * @returns URL or a rejected Promise.
   * @example await client.createReadUrl("a");
   */
  createReadUrl(key: string): Promise<string>;
  /** Request a signed upload URL.
   * @param key - Portable key.
   * @returns URL or a rejected Promise.
   * @example await client.createWriteUrl("a");
   */
  createWriteUrl(key: string): Promise<string>;
}
/** Metadata passed to an optional invocation bridge.
 * @example const name = bridgeOptions.name;
 */
export interface BucketBridgeOptions {
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly input?: unknown;
}
/** Bridge that owns external invocation instrumentation.
 * @example const bridge: BucketInvocationBridge = { run: async (operation) => operation() };
 */
export interface BucketInvocationBridge {
  /** Invoke an operation through the bridge's tracing and cancellation boundary.
   * @param operation - Provider work to run.
   * @param options - Invocation name, attributes, signal, and input.
   * @returns The operation result or a rejected Promise.
   * @example await bridge.run(() => provider.get!("a"), { name: "bucket.get", attributes: {}, signal });
   */
  readonly run: <A>(operation: () => MaybePromise<A>, options?: BucketBridgeOptions) => Promise<A>;
}
/** Observed function-to-bucket dependency edge.
 * @example const edge: BucketObservedEdge = { relationship: "uses-bucket", from: "job", to: "assets" };
 */
export interface BucketObservedEdge {
  readonly relationship: "uses-bucket";
  readonly from: string;
  readonly to: string;
}
/** Advisory completion signal emitted after a bucket operation.
 * @example const outcome = observation.outcome;
 */
export interface BucketOperationObservation {
  readonly capability: "buckets";
  readonly operation: BucketOperation;
  readonly ownerId: string;
  readonly bucketId: string;
  readonly outcome: BucketOperationOutcome;
}
/** Configuration for a Promise bucket client.
 * @example const options: BucketClientOptions = { ownerId: "job", bucketId: "assets", source: {} };
 */
export interface BucketClientOptions {
  readonly ownerId: string;
  readonly bucketId: string;
  readonly source: unknown;
  readonly bridge?: BucketInvocationBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly declared?: boolean;
  readonly onObservedEdge?: (edge: BucketObservedEdge) => void;
  readonly onOperation?: (operation: BucketOperationObservation) => void;
}
