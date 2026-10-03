import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type {
  AcquirePresenceLease,
  PresenceSnapshot,
  ReadPresenceRequest,
  ReleasePresenceLease,
  RenewPresenceLease,
} from "@relkit/realtime";
import { emptyPartition, partitionKey } from "./common.js";
import type { LocalRealtimeState, StoredPresenceLease } from "./state.js";
import type { RealtimeStateStoreEffects as RealtimeStateStore } from "./storage.js";

/**
 * Returns active connection and optional member counts for a partition.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const readPresence = Effect.fn("Realtime.readPresence")(
  function* (store: RealtimeStateStore, request: ReadPresenceRequest) {
    const operationNow = yield* Clock.currentTimeMillis;

    const state = yield* store.read();
    return snapshot(state, request, activeLeases(state, request, operationNow));
  },
  (effect) => localOperation("Realtime.readPresence", effect),
);

/**
 * Persists a presence lease while enforcing connection and member capacities.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const acquirePresence = Effect.fn("Realtime.acquirePresence")(
  function* (store: RealtimeStateStore, request: AcquirePresenceLease) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return changePresence(store, request, (leases) => {
          const next = leases.filter((lease) => lease.leaseId !== request.leaseId);
          next.push({
            leaseId: request.leaseId,
            connectionId: request.connectionId,
            ...(request.opaqueMemberId === undefined
              ? {}
              : { opaqueMemberId: request.opaqueMemberId }),
            ...(request.memberInfo === undefined ? {} : { memberInfo: request.memberInfo }),
            expiresAt: request.expiresAt,
          });
          return next;
        });
      }),
    );
  },
  (effect) => localOperation("Realtime.acquirePresence", effect),
);

/**
 * Renews a presence lease without creating an unknown connection.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const renewPresence = Effect.fn("Realtime.renewPresence")(
  function* (store: RealtimeStateStore, request: RenewPresenceLease) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return changePresence(store, request, (leases) => {
          const existing = leases.find((lease) => lease.leaseId === request.leaseId);
          if (existing === undefined) throw new Error("Presence lease does not exist.");
          return leases.map((lease) =>
            lease.leaseId === request.leaseId
              ? { ...existing, expiresAt: request.expiresAt }
              : lease,
          );
        });
      }),
    );
  },
  (effect) => localOperation("Realtime.renewPresence", effect),
);

/**
 * Removes a matching presence lease and returns the resulting snapshot.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const releasePresence = Effect.fn("Realtime.releasePresence")(
  function* (store: RealtimeStateStore, request: ReleasePresenceLease) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return changePresence(store, request, (leases) =>
          leases.filter((lease) => lease.leaseId !== request.leaseId),
        );
      }),
    );
  },
  (effect) => localOperation("Realtime.releasePresence", effect),
);

/**
 * Applies one presence mutation inside the shared-state transaction.
 * @param store - Owning transaction or durable journal operations.
 * @param request - Validated scoped domain request.
 * @param update - Pure presence-state transition.
 * @returns A lazy effect yielding the public presence result after commit.
 */
const changePresence = Effect.fn("Realtime.changePresence")(
  function* (
    store: RealtimeStateStore,
    request: AcquirePresenceLease | RenewPresenceLease | ReleasePresenceLease,
    update: (leases: StoredPresenceLease[]) => StoredPresenceLease[],
  ) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const key = partitionKey(request);
          const partition = state.partitions[key] ?? emptyPartition(state.sequence);
          const presence = update(activeLeases(state, request, operationNow));
          const allActive = Object.values(state.partitions)
            .flatMap((partition) => partition.presence)
            .filter((lease) => Date.parse(lease.expiresAt) > operationNow);
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
      }),
    );
  },
  (effect) => localOperation("Realtime.changePresence", effect),
);

/**
 * Selects presence leases whose expiration is later than the supplied clock time.
 * @param state - Persisted domain snapshot.
 * @param request - Validated domain request and scope.
 * @param now - Current clock time in milliseconds.
 * @returns Leases whose expiry is later than the supplied time.
 */
function activeLeases(
  state: LocalRealtimeState,
  request: ReadPresenceRequest,
  now: number,
): StoredPresenceLease[] {
  const leases = state.partitions[partitionKey(request)]?.presence ?? [];
  return leases.filter((lease) => Date.parse(lease.expiresAt) > now);
}

/**
 * Projects active presence leases into the public bounded presence snapshot.
 * @param state - Persisted domain snapshot.
 * @param request - Validated domain request and scope.
 * @param leases - Persisted presence lease collection.
 * @returns The public state projection.
 */
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
