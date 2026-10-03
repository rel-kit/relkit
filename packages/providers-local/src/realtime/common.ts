import { canonicalJson } from "@relkit/contracts";
import type { ChannelCheckpoint, RealtimeScope } from "@relkit/realtime";
import type { LocalRealtimeState, StoredRealtimePartition } from "./state.js";

/** Preserves the public local realtime error identity and stable error code. */
export class LocalRealtimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LocalRealtimeError";
  }
}

/**
 * Encodes the channel and scope into a stable realtime partition key.
 * @param scope - Application, environment and caller scope.
 * @returns The canonical realtime partition identity.
 */
export function partitionKey(scope: RealtimeScope): string {
  return canonicalJson({
    applicationId: scope.applicationId,
    environment: scope.environment,
    tenantScope: scope.tenantScope ?? null,
    channelId: scope.channelId,
    partition: scope.partition,
    profile: scope.profile,
  });
}

/**
 * Creates an empty retained event and presence partition.
 * @param sequence - Monotonic durable record position.
 * @returns An empty retained event/presence partition.
 */
export function emptyPartition(sequence: number): StoredRealtimePartition {
  return { historyStart: sequence + 1, events: [], presence: [] };
}

/**
 * Measures canonical JSON bytes for admission limits.
 * @param value - Untrusted or projected value to inspect.
 * @returns The canonical JSON byte count.
 */
export function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * Removes expired events and enforces retention bounds without renumbering sequences.
 * @param now - Current clock time in milliseconds.
 * @param partition - Scoped retained realtime event and presence state.
 * @returns The retained partition after expiry and capacity pruning.
 */
export function prunePartition(
  partition: StoredRealtimePartition,
  now: number,
): StoredRealtimePartition {
  const events = partition.events.filter((event) => Date.parse(event.expiresAt) > now);
  const previousTail = partition.events.at(-1)?.sequence;
  return {
    ...partition,
    events,
    historyStart: events[0]?.sequence ?? (previousTail ?? partition.historyStart - 1) + 1,
  };
}

/**
 * Builds the current journal checkpoint from the persisted sequence.
 * @param scope - Application, environment and caller scope.
 * @param state - Persisted domain snapshot.
 * @param sequence - Monotonic durable record position.
 * @param historyStart - First retained snapshot sequence.
 * @param expiresAt - Expiry time for the retained record.
 * @returns The current replay checkpoint.
 */
export function checkpoint(
  scope: RealtimeScope,
  state: LocalRealtimeState,
  sequence: number,
  historyStart: number,
  expiresAt: string,
): ChannelCheckpoint {
  return {
    ...scope,
    providerEpoch: state.providerEpoch,
    sequence: String(sequence),
    historyStart: String(historyStart),
    expiresAt,
  };
}

/**
 * Constructs a replay gap describing the requested checkpoint and current scope.
 * @param expected - Expected value or state precondition.
 * @param actual - Actual value to compare against the policy.
 * @param providerEpoch - Provider generation identity used in checkpoints.
 * @returns The replay gap describing the checkpoint mismatch.
 */
export function scopeGap(
  expected: RealtimeScope,
  actual: ChannelCheckpoint,
  providerEpoch: string,
): "foreign" | "policy" | "session" | "provider-reset" | undefined {
  if (actual.providerEpoch !== providerEpoch) return "provider-reset";
  if (actual.sessionEpoch !== expected.sessionEpoch) return "session";
  if (actual.policyEpoch !== expected.policyEpoch) return "policy";
  return partitionKey(actual) === partitionKey(expected) &&
    actual.identityScope === expected.identityScope
    ? undefined
    : "foreign";
}
