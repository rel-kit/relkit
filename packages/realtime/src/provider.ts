import type { OperationId, ReceiptLookup } from "@relkit/contracts";
import type {
  ChannelCheckpoint,
  ChannelEventRecord,
  PresenceSnapshot,
  RealtimeScope,
  TriggerReceipt,
} from "./types.js";

export interface RealtimeLimits {
  readonly maxEventBytes: number;
  readonly maxRetainedBytes: number;
  readonly maxPartitions: number;
  readonly maxConnections: number;
  readonly maxPresenceMembers: number;
}

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

export interface LookupAppendReceipt extends RealtimeScope {
  readonly operationId: OperationId;
  readonly semanticDigest: string;
  readonly receiptWindowMs: number;
  readonly now: string;
}

export type AppendReceiptLookup = ReceiptLookup<TriggerReceipt>;

export interface ReadChannelEvents extends RealtimeScope {
  readonly after?: ChannelCheckpoint;
  readonly limit: number;
  readonly maxEncodedBytes: number;
}

export interface ChannelEventPage {
  readonly events: readonly ChannelEventRecord[];
  readonly checkpoint: ChannelCheckpoint;
  readonly hasMore: boolean;
  readonly gap?: "expired" | "foreign" | "future" | "policy" | "session" | "provider-reset";
}

export interface WaitForChannelEvents extends RealtimeScope {
  readonly after: ChannelCheckpoint;
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
}

export interface PresenceLeaseRequest extends RealtimeScope {
  readonly leaseId: string;
  readonly connectionId: string;
  readonly opaqueMemberId?: string;
  readonly memberInfo?: unknown;
  readonly expiresAt: string;
  readonly maxMembers: number;
  readonly maxConnections: number;
}

export type ReadPresenceRequest = RealtimeScope & {
  readonly maxMembers: number;
};
export type AcquirePresenceLease = PresenceLeaseRequest;
export type RenewPresenceLease = PresenceLeaseRequest;
export type ReleasePresenceLease = Omit<PresenceLeaseRequest, "expiresAt">;

export interface RealtimeProvider {
  readonly capabilities: {
    readonly replay: "memory" | "retained";
    readonly presenceScope: "process" | "shared";
    readonly durability: "volatile" | "filesystem" | "redis-configured";
  };
  getEpoch(): Promise<string>;
  append(request: AppendChannelEvent): Promise<TriggerReceipt>;
  lookupAppendReceipt(request: LookupAppendReceipt): Promise<AppendReceiptLookup>;
  readAfter(request: ReadChannelEvents): Promise<ChannelEventPage>;
  waitAfter(request: WaitForChannelEvents): Promise<void>;
  readPresence(request: ReadPresenceRequest): Promise<PresenceSnapshot>;
  acquirePresence(request: AcquirePresenceLease): Promise<PresenceSnapshot>;
  renewPresence(request: RenewPresenceLease): Promise<PresenceSnapshot>;
  releasePresence(request: ReleasePresenceLease): Promise<PresenceSnapshot>;
}
