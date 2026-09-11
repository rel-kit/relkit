import type { TriggerReceipt } from "@relkit/realtime";

export const LOCAL_REALTIME_STATE_VERSION = 2;

export interface StoredRealtimeEvent {
  readonly sequence: number;
  readonly eventId: string;
  readonly event: string;
  readonly payload: unknown;
  readonly encodedBytes: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface StoredPresenceLease {
  readonly leaseId: string;
  readonly connectionId: string;
  readonly opaqueMemberId?: string;
  readonly memberInfo?: unknown;
  readonly expiresAt: string;
}

export interface StoredRealtimePartition {
  readonly historyStart: number;
  readonly events: readonly StoredRealtimeEvent[];
  readonly presence: readonly StoredPresenceLease[];
}

export interface StoredAppendReceipt {
  readonly semanticDigest: string;
  readonly expiresAt: string;
  readonly receipt: TriggerReceipt;
}

export interface LocalRealtimeState {
  readonly version: typeof LOCAL_REALTIME_STATE_VERSION;
  readonly providerEpoch: string;
  readonly sequence: number;
  readonly revision: number;
  readonly retainedBytes: number;
  readonly partitions: Readonly<Record<string, StoredRealtimePartition>>;
  readonly receipts: Readonly<Record<string, StoredAppendReceipt>>;
}

export function emptyRealtimeState(epoch = crypto.randomUUID()): LocalRealtimeState {
  return {
    version: LOCAL_REALTIME_STATE_VERSION,
    providerEpoch: epoch,
    sequence: 0,
    revision: 0,
    retainedBytes: 0,
    partitions: {},
    receipts: {},
  };
}
