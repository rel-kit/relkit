import type { OperationId, ReceiptLookup } from "@relkit/contracts";
import type {
  ChannelCheckpoint,
  ChannelEventRecord,
  PresenceSnapshot,
  RealtimeScope,
  TriggerReceipt,
} from "./types.js";

/** Provider-enforced bounds for event, connection, partition, and presence storage.
 * @example const limits: RealtimeLimits = { maxEventBytes: 1024, maxRetainedBytes: 4096, maxPartitions: 10, maxConnections: 10, maxPresenceMembers: 10 };
 */
export interface RealtimeLimits {
  readonly maxEventBytes: number;
  readonly maxRetainedBytes: number;
  readonly maxPartitions: number;
  readonly maxConnections: number;
  readonly maxPresenceMembers: number;
}

/** Validated event append request including idempotency and retention settings.
 * @example const append: AppendChannelEvent = { ...scope, event: "posted", payload: "hi", encodedBytes: 42, occurredAt: new Date().toISOString(), limits };
 */
export interface AppendChannelEvent extends RealtimeScope {
  readonly operationId?: OperationId;
  readonly semanticDigest?: string;
  readonly event: string;
  readonly payload: unknown;
  readonly encodedBytes: number;
  readonly occurredAt: string;
  readonly receiptExpiresAt?: string;
  readonly retentionMs?: number;
  readonly maxEvents?: number;
  readonly limits: RealtimeLimits;
}

/** Provider lookup for an existing idempotent append receipt.
 * @example const lookup: LookupAppendReceipt = { ...scope, operationId: id, semanticDigest: digest, receiptWindowMs: 60000, now: new Date().toISOString() };
 */
export interface LookupAppendReceipt extends RealtimeScope {
  readonly operationId: OperationId;
  readonly semanticDigest: string;
  readonly receiptWindowMs: number;
  readonly now: string;
}

/** Provider receipt lookup result.
 * @example const result: AppendReceiptLookup = await provider.lookupAppendReceipt(lookup);
 */
export type AppendReceiptLookup = ReceiptLookup<TriggerReceipt>;

/** Bounded replay page request.
 * @example const read: ReadChannelEvents = { ...scope, limit: 10, maxEncodedBytes: 4096 };
 */
export interface ReadChannelEvents extends RealtimeScope {
  readonly after?: ChannelCheckpoint;
  readonly limit: number;
  readonly maxEncodedBytes: number;
}

/** Ordered provider replay page and its next checkpoint.
 * @example const page: ChannelEventPage = await provider.readAfter(read);
 */
export interface ChannelEventPage {
  readonly events: readonly ChannelEventRecord[];
  readonly checkpoint: ChannelCheckpoint;
  readonly hasMore: boolean;
  readonly gap?: "expired" | "foreign" | "future" | "policy" | "session" | "provider-reset";
}

/** Abortable long-poll request owned by its caller.
 * @example const wait: WaitForChannelEvents = { ...scope, after: checkpoint, deadlineMs: Date.now() + 1000, signal: controller.signal };
 */
export interface WaitForChannelEvents extends RealtimeScope {
  readonly after: ChannelCheckpoint;
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
}

/** Presence lease mutation request; providers own lease persistence.
 * @example const lease: PresenceLeaseRequest = { ...scope, leaseId: "l1", connectionId: "c1", expiresAt: new Date().toISOString(), maxMembers: 10, maxConnections: 10 };
 */
export interface PresenceLeaseRequest extends RealtimeScope {
  readonly leaseId: string;
  readonly connectionId: string;
  readonly opaqueMemberId?: string;
  readonly memberInfo?: unknown;
  readonly expiresAt: string;
  readonly maxMembers: number;
  readonly maxConnections: number;
}

/** Presence read with a bounded member count.
 * @example const read: ReadPresenceRequest = { ...scope, maxMembers: 10 };
 */
export type ReadPresenceRequest = RealtimeScope & {
  readonly maxMembers: number;
};
/** Initial lease request.
 * @example const request: AcquirePresenceLease = lease;
 */
export type AcquirePresenceLease = PresenceLeaseRequest;
/** Existing lease renewal request.
 * @example const request: RenewPresenceLease = lease;
 */
export type RenewPresenceLease = PresenceLeaseRequest;
/** Lease release request without an expiry.
 * @example const request: ReleasePresenceLease = { ...scope, leaseId: "l1", connectionId: "c1", maxMembers: 10, maxConnections: 10 };
 */
export type ReleasePresenceLease = Omit<PresenceLeaseRequest, "expiresAt">;

/** Backend contract for ordered events, idempotency, and presence.
 * The caller owns aborting waitAfter; provider implementations own their internal resources.
 * @example const epoch = await provider.getEpoch();
 */
export interface RealtimeProvider {
  readonly capabilities: {
    readonly replay: "memory" | "retained";
    readonly presenceScope: "process" | "shared";
    readonly durability: "volatile" | "filesystem" | "redis-configured";
  };
  /** Reads the provider generation epoch.
   * @param signal - Optional cancellation signal for in-flight work.
   * @returns The epoch or a provider rejection.
   * @example await provider.getEpoch();
   */
  getEpoch(signal?: AbortSignal): Promise<string>;
  /** Appends a validated event.
   * @param request - Event and scope metadata.
   * @param signal - Optional cancellation signal; an implementation may already have committed an append when aborted.
   * @returns A receipt or a provider rejection.
   * @example await provider.append(append);
   */
  append(request: AppendChannelEvent, signal?: AbortSignal): Promise<TriggerReceipt>;
  /** Looks up an idempotent append receipt.
   * @param request - Receipt lookup key and time window.
   * @returns Existing receipt state or a provider rejection.
   * @example await provider.lookupAppendReceipt(lookup);
   */
  lookupAppendReceipt(request: LookupAppendReceipt): Promise<AppendReceiptLookup>;
  /** Reads an ordered, bounded event page.
   * @param request - Replay cursor and limits.
   * @returns A page or a provider rejection.
   * @example await provider.readAfter(read);
   */
  readAfter(request: ReadChannelEvents): Promise<ChannelEventPage>;
  /** Waits for events until a deadline or caller abort.
   * @param request - Cursor, deadline, and caller-owned abort signal.
   * @returns Completion or a provider rejection.
   * @example await provider.waitAfter(wait);
   */
  waitAfter(request: WaitForChannelEvents): Promise<void>;
  /** Reads current presence.
   * @param request - Scope and member limit.
   * @param signal - Optional cancellation signal for in-flight work.
   * @returns Presence snapshot or a provider rejection.
   * @example await provider.readPresence(read);
   */
  readPresence(request: ReadPresenceRequest, signal?: AbortSignal): Promise<PresenceSnapshot>;
  /** Acquires a presence lease.
   * @param request - Lease identity, expiry, and limits.
   * @returns Updated presence or a provider rejection.
   * @example await provider.acquirePresence(lease);
   */
  acquirePresence(request: AcquirePresenceLease): Promise<PresenceSnapshot>;
  /** Renews a presence lease.
   * @param request - Existing lease and next expiry.
   * @returns Updated presence or a provider rejection.
   * @example await provider.renewPresence(lease);
   */
  renewPresence(request: RenewPresenceLease): Promise<PresenceSnapshot>;
  /** Releases a presence lease.
   * @param request - Existing lease without expiry.
   * @returns Updated presence or a provider rejection.
   * @example await provider.releasePresence(release);
   */
  releasePresence(request: ReleasePresenceLease): Promise<PresenceSnapshot>;
}
