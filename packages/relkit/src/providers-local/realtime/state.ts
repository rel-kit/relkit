import type {
  StoredRealtimeEvent,
  StoredPresenceLease,
  StoredRealtimePartition,
  StoredAppendReceipt,
  LocalRealtimeState,
} from "./state.types.js";
export type {
  StoredRealtimeEvent,
  StoredPresenceLease,
  StoredRealtimePartition,
  StoredAppendReceipt,
  LocalRealtimeState,
} from "./state.types.js";

export const LOCAL_REALTIME_STATE_VERSION = 2;

/**
 * Creates format-v1 realtime state with an epoch and empty partition/receipt indexes.
 * @param epoch - Provider generation identity.
 * @returns An empty format-v1 realtime snapshot with its epoch.
 */
export function emptyRealtimeState(epoch: string = crypto.randomUUID()): LocalRealtimeState {
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
