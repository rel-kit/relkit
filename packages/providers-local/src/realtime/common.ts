import { canonicalJson } from "@relkit/contracts";
import type { ChannelCheckpoint, RealtimeScope } from "@relkit/realtime";
import type { LocalRealtimeState, StoredRealtimePartition } from "./state.js";

export class LocalRealtimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LocalRealtimeError";
  }
}

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

export function emptyPartition(sequence: number): StoredRealtimePartition {
  return { historyStart: sequence + 1, events: [], presence: [] };
}

export function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

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
