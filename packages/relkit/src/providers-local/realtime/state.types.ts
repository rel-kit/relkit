import type {
  RealtimeState,
  RealtimeEvent,
  RealtimePartition,
  PresenceLease,
  AppendReceipt,
} from "./state.schemas.js";

/** Complete validated version-two realtime snapshot. */
export type LocalRealtimeState = typeof RealtimeState.Type;

/** Stored ordered event whose application payload remains opaque. */
export type StoredRealtimeEvent = typeof RealtimeEvent.Type;

/** Connection lease decoded before expiry and capacity decisions. */
export type StoredPresenceLease = typeof PresenceLease.Type;

/** Atomic partition history and presence representation. */
export type StoredRealtimePartition = typeof RealtimePartition.Type;

/** Idempotent append acknowledgement with semantic digest and expiry. */
export type StoredAppendReceipt = typeof AppendReceipt.Type;
