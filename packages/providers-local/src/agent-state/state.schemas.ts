import { Schema } from "effect";
import { StateCount, StoredOperationId } from "../state.schemas.js";
import { AgentMessage, AgentWaiting } from "./content.schemas.js";

/** The persisted public journal cursor identifies a thread and monotonic sequence. */
export const JournalCheckpoint = Schema.Struct({
  applicationId: Schema.String,
  environment: Schema.String,
  profile: Schema.String,
  providerEpoch: Schema.String,
  threadId: Schema.String,
  sequence: Schema.String,
});

/** Runtime identity fencing one accepted run. */
const Owner = Schema.Struct({
  generationId: Schema.String,
  publicFingerprint: Schema.String,
  protocolVersion: StateCount,
  schemaVersion: StateCount,
  providerScope: Schema.String,
});

/** Run state and enforced journal capacity survive process restarts together. */
export const AgentRun = Schema.Struct({
  runId: Schema.String,
  threadId: Schema.String,
  owner: Owner,
  operationId: StoredOperationId,
  status: Schema.Literals([
    "accepted",
    "running",
    "waiting",
    "approval-interrupted",
    "stopping",
    "succeeded",
    "failed",
    "cancelled",
    "worker-interrupted",
  ]),
  inputDigest: Schema.String,
  acceptedAt: Schema.String,
  settledAt: Schema.optionalKey(Schema.String),
  outcome: Schema.optionalKey(
    Schema.Literals(["succeeded", "failed", "cancelled", "worker-interrupted"]),
  ),
  maxJournalBytes: StateCount,
  maxJournalRecordBytes: StateCount,
  terminalReserveBytes: StateCount,
});

/** Approval data exposed to clients while application payloads remain opaque. */
const Approval = Schema.Struct({
  approvalId: Schema.String,
  runId: Schema.String,
  interruptSetDigest: Schema.String,
  interruptSetSize: Schema.optionalKey(StateCount),
  status: Schema.Literals(["open", "approved", "denied", "cancelled"]),
  publicRequest: Schema.Unknown,
});

/** Public journal metadata validated before replay and byte accounting. */
const Journal = Schema.Struct({
  recordId: Schema.String,
  runId: Schema.String,
  kind: Schema.Literals([
    "message",
    "progress",
    "approval",
    "control",
    "terminal",
    "interruption",
    "event",
  ]),
  publicValue: Schema.Unknown,
  checkpoint: JournalCheckpoint,
  encodedBytes: StateCount,
  createdAt: Schema.String,
});

/** Pending or settled control lifecycle. */
const ControlStatus = Schema.Literals([
  "accepted",
  "processing",
  "applied",
  "rejected",
  "cancelled",
]);

/** Whether the external side effect is confirmed after recovery. */
const ControlEffect = Schema.Literals(["not-started", "confirmed", "unknown"]);

/** Durable acknowledgement of control identity and outcome. */
export const AgentControlReceipt = Schema.Struct({
  operationId: StoredOperationId,
  threadId: Schema.String,
  runId: Schema.String,
  status: ControlStatus,
  effect: ControlEffect,
  duplicate: Schema.Boolean,
});

/** Control record, receipt and semantic identity commit in one transaction. */
export const AgentControl = Schema.Struct({
  sequence: StateCount,
  record: Schema.Struct({
    controlId: StoredOperationId,
    runId: Schema.String,
    kind: Schema.Literals(["steer", "follow-up", "stop", "approve"]),
    semanticDigest: Schema.String,
    publicPayload: Schema.optionalKey(Schema.Unknown),
    status: ControlStatus,
    effect: ControlEffect,
    acceptedAt: Schema.String,
    settledAt: Schema.optionalKey(Schema.String),
  }),
  receipt: AgentControlReceipt,
  semanticDigest: Schema.String,
  expiresAt: Schema.String,
  publicPayload: Schema.Unknown,
  downstreamOperationId: Schema.optionalKey(Schema.String),
});

/** Common persisted lease fields ensure a stale worker cannot reclaim ownership. */
const ClaimFields = {
  claimId: Schema.String,
  workerId: Schema.String,
  generationId: Schema.String,
  fence: StateCount,
  expiresAt: Schema.String,
};

/** A pinned history view retained independently of live message mutation. */
export const PinnedSnapshot = Schema.Struct({
  createdAt: Schema.String,
  messages: Schema.Array(AgentMessage),
});

/** Thread metadata, run/control indexes and retained public content. */
export const AgentThread = Schema.Struct({
  scopeKey: Schema.String,
  thread: Schema.Struct({
    threadId: Schema.String,
    agentId: Schema.String,
    ownerScope: Schema.String,
    status: Schema.Literals([
      "idle",
      "running",
      "waiting",
      "approval-interrupted",
      "stopping",
      "worker-interrupted",
    ]),
    revision: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
  activeRunId: Schema.optionalKey(Schema.String),
  runs: Schema.Record(Schema.String, AgentRun),
  messages: Schema.Array(AgentMessage),
  approvals: Schema.Array(Approval),
  waiting: Schema.optionalKey(AgentWaiting),
  journal: Schema.Array(Journal),
  controls: Schema.Record(Schema.String, AgentControl),
  sequence: StateCount,
  controlSequence: StateCount,
  nextFence: StateCount,
  runClaims: Schema.Record(Schema.String, Schema.Struct({ ...ClaimFields, runId: Schema.String })),
  controlClaims: Schema.Record(
    Schema.String,
    Schema.Struct({ ...ClaimFields, controlId: StoredOperationId }),
  ),
  snapshots: Schema.optionalKey(Schema.Record(Schema.String, PinnedSnapshot)),
});

/** Accepted and completed run receipts share one idempotency index. */
const RunReceipt = Schema.Union([
  Schema.Struct({
    operationId: StoredOperationId,
    threadId: Schema.String,
    runId: Schema.String,
    status: Schema.Literal("accepted"),
    duplicate: Schema.Boolean,
  }),
  Schema.Struct({
    operationId: StoredOperationId,
    threadId: Schema.String,
    runId: Schema.String,
    status: Schema.Literals(["succeeded", "failed", "cancelled"]),
    checkpoint: JournalCheckpoint,
    duplicate: Schema.Boolean,
  }),
]);

/** Receipt identifying exactly which interruption produced a continuation. */
const ContinuationReceipt = Schema.Struct({
  operationId: StoredOperationId,
  threadId: Schema.String,
  interruptedRunId: Schema.String,
  runId: Schema.String,
  interruptSetDigest: Schema.String,
  waitingRevision: Schema.optionalKey(Schema.String),
  duplicate: Schema.Boolean,
});

/**
 * Adds persisted semantic identity and expiration to a receipt schema.
 * @param value - Receipt payload schema.
 * @returns A schema for the persisted receipt envelope.
 * @typeParam S - Receipt payload schema.
 */
const receipt = <S extends Schema.Constraint>(value: S) =>
  Schema.Struct({ semanticDigest: Schema.String, expiresAt: Schema.String, value });

/** Complete version-one agent snapshot decoded before any state transition. */
export const AgentState = Schema.Struct({
  version: Schema.Literal(1),
  providerEpoch: Schema.String,
  revision: StateCount,
  threads: Schema.Record(Schema.String, AgentThread),
  createReceipts: Schema.Record(
    Schema.String,
    Schema.Struct({ digest: Schema.String, threadId: Schema.String }),
  ),
  runReceipts: Schema.Record(Schema.String, receipt(RunReceipt)),
  controlReceipts: Schema.Record(Schema.String, receipt(AgentControlReceipt)),
  continuationReceipts: Schema.Record(Schema.String, receipt(ContinuationReceipt)),
});
