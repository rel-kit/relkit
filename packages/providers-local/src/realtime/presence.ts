import type {
  AcquirePresenceLease,
  PresenceSnapshot,
  ReadPresenceRequest,
  ReleasePresenceLease,
  RenewPresenceLease,
} from "@relkit/realtime";
import { emptyPartition, partitionKey } from "./common.js";
import type { LocalRealtimeState, StoredPresenceLease } from "./state.js";
import type { RealtimeStateStore } from "./storage.js";

export async function readPresence(
  store: RealtimeStateStore,
  request: ReadPresenceRequest,
): Promise<PresenceSnapshot> {
  const state = await store.read();
  return snapshot(state, request, activeLeases(state, request));
}

export function acquirePresence(
  store: RealtimeStateStore,
  request: AcquirePresenceLease,
): Promise<PresenceSnapshot> {
  return changePresence(store, request, (leases) => {
    const next = leases.filter((lease) => lease.leaseId !== request.leaseId);
    next.push({
      leaseId: request.leaseId,
      connectionId: request.connectionId,
      ...(request.opaqueMemberId === undefined ? {} : { opaqueMemberId: request.opaqueMemberId }),
      ...(request.memberInfo === undefined ? {} : { memberInfo: request.memberInfo }),
      expiresAt: request.expiresAt,
    });
    return next;
  });
}

export function renewPresence(
  store: RealtimeStateStore,
  request: RenewPresenceLease,
): Promise<PresenceSnapshot> {
  return changePresence(store, request, (leases) => {
    const existing = leases.find((lease) => lease.leaseId === request.leaseId);
    if (existing === undefined) throw new Error("Presence lease does not exist.");
    return leases.map((lease) =>
      lease.leaseId === request.leaseId ? { ...existing, expiresAt: request.expiresAt } : lease,
    );
  });
}

export function releasePresence(
  store: RealtimeStateStore,
  request: ReleasePresenceLease,
): Promise<PresenceSnapshot> {
  return changePresence(store, request, (leases) =>
    leases.filter((lease) => lease.leaseId !== request.leaseId),
  );
}

function changePresence(
  store: RealtimeStateStore,
  request: AcquirePresenceLease | RenewPresenceLease | ReleasePresenceLease,
  update: (leases: StoredPresenceLease[]) => StoredPresenceLease[],
): Promise<PresenceSnapshot> {
  return store.update((state) => {
    const key = partitionKey(request);
    const partition = state.partitions[key] ?? emptyPartition(state.sequence);
    const presence = update(activeLeases(state, request));
    const allActive = Object.values(state.partitions)
      .flatMap((partition) => partition.presence)
      .filter((lease) => Date.parse(lease.expiresAt) > Date.now());
    const existing = allActive.some((lease) => lease.leaseId === request.leaseId);
    if ("expiresAt" in request && allActive.length >= request.maxConnections && !existing) {
      throw new Error("PRESENCE_CAPACITY_EXCEEDED");
    }
    const next = {
      ...state,
      revision: state.revision + 1,
      partitions: { ...state.partitions, [key]: { ...partition, presence } },
    };
    return { state: next, value: snapshot(next, request, presence) };
  });
}

function activeLeases(
  state: LocalRealtimeState,
  request: ReadPresenceRequest,
): StoredPresenceLease[] {
  const leases = state.partitions[partitionKey(request)]?.presence ?? [];
  const now = Date.now();
  return leases.filter((lease) => Date.parse(lease.expiresAt) > now);
}

function snapshot(
  state: LocalRealtimeState,
  request: ReadPresenceRequest,
  leases: readonly StoredPresenceLease[],
): PresenceSnapshot {
  const members = new Map<string, unknown>();
  for (const lease of leases) {
    if (lease.opaqueMemberId !== undefined && !members.has(lease.opaqueMemberId)) {
      members.set(lease.opaqueMemberId, lease.memberInfo);
    }
  }
  if (members.size === 0 && leases.every((lease) => lease.opaqueMemberId === undefined)) {
    return {
      connections: leases.length,
      status: "fresh",
      revision: String(state.revision),
      scope: "shared",
    };
  }
  const entries = [...members].slice(0, request.maxMembers).map(([id, info]) => ({ id, info }));
  return {
    connections: leases.length,
    status: "fresh",
    revision: String(state.revision),
    scope: "shared",
    memberCount: members.size,
    members: entries,
    membersTruncated: members.size > entries.length,
  };
}
