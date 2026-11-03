import { Schema } from "effect";
import { StateCount, StoredOperationId } from "../state.schemas.js";

/** Persisted cursor identity binds an acknowledgement to one client and channel. */
const Checkpoint = Schema.Struct({
  applicationId: Schema.String,
  environment: Schema.String,
  tenantScope: Schema.optionalKey(Schema.String),
  channelId: Schema.String,
  partition: Schema.String,
  profile: Schema.String,
  policyEpoch: Schema.String,
  providerEpoch: Schema.String,
  identityScope: Schema.String,
  sessionEpoch: Schema.String,
  sequence: Schema.String,
  historyStart: Schema.String,
  expiresAt: Schema.String,
});

/** Durable accepted-event acknowledgement, including its duplicate marker. */
const Receipt = Schema.Struct({
  accepted: Schema.Literal(true),
  operationId: Schema.optionalKey(StoredOperationId),
  eventId: Schema.String,
  checkpoint: Checkpoint,
  profile: Schema.String,
  providerEpoch: Schema.String,
  duplicate: Schema.Boolean,
});

/** Stored event payloads remain opaque; ordering and size metadata are validated. */
export const RealtimeEvent = Schema.Struct({
  sequence: StateCount,
  eventId: Schema.String,
  event: Schema.String,
  payload: Schema.Unknown,
  encodedBytes: StateCount,
  createdAt: Schema.String,
  expiresAt: Schema.String,
});

/** One connection's persisted presence lease. */
export const PresenceLease = Schema.Struct({
  leaseId: Schema.String,
  connectionId: Schema.String,
  opaqueMemberId: Schema.optionalKey(Schema.String),
  memberInfo: Schema.optionalKey(Schema.Unknown),
  expiresAt: Schema.String,
});

/** Partition history and presence share an atomic snapshot. */
export const RealtimePartition = Schema.Struct({
  historyStart: StateCount,
  events: Schema.Array(RealtimeEvent),
  presence: Schema.Array(PresenceLease),
});

/** Idempotency receipt retained until its declared expiration. */
export const AppendReceipt = Schema.Struct({
  semanticDigest: Schema.String,
  expiresAt: Schema.String,
  receipt: Receipt,
});

/** Complete version-two snapshot decoder; malformed nested records fail before use. */
export const RealtimeState = Schema.Struct({
  version: Schema.Literal(2),
  providerEpoch: Schema.String,
  sequence: StateCount,
  revision: StateCount,
  retainedBytes: StateCount,
  partitions: Schema.Record(Schema.String, RealtimePartition),
  receipts: Schema.Record(Schema.String, AppendReceipt),
});
