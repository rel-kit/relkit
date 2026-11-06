/**
 * Shared realtime provider conformance suite. Every first-party realtime provider (local, Redis,
 * Cloudflare Durable Objects) runs these cases with two instances on one backend, and provider
 * authors run the same ones.
 */
import type { AppendChannelEvent, RealtimeScope } from "relkit/realtime";
import { createOperationId } from "relkit/realtime/operation-id";
import type { ConformanceHarness } from "./conformance.types.js";
import type {
  RealtimeConformanceCase,
  RealtimeConformanceCaseId,
  RealtimeConformanceOptions,
  RealtimeConformanceProvider,
} from "./realtime-conformance.types.js";
import { check, conformanceHarness, rejects, same, SKIPPED } from "./conformance.js";

export type * from "./realtime-conformance.types.js";

/** The cases every realtime provider passes. */
export const REALTIME_CONFORMANCE_CASES: readonly RealtimeConformanceCase[] = Object.freeze([
  { id: "wake-on-append", description: "a waiter wakes when another instance appends" },
  { id: "read-after-checkpoint", description: "a page after a checkpoint holds only newer events" },
  { id: "concurrent-appends", description: "concurrent appends from two instances all land" },
  { id: "idempotent-append", description: "a repeated operation id returns a duplicate receipt" },
  { id: "wait-deadline", description: "a wait with no events settles at its deadline" },
  { id: "presence", description: "presence leases are shared and released" },
  { id: "backend-failure", description: "a failing backend rejects" },
]);

const LIMITS = {
  maxEventBytes: 65_536,
  maxRetainedBytes: 1_048_576,
  maxPartitions: 10,
  maxConnections: 10,
  maxPresenceMembers: 100,
};
const READ = { limit: 50, maxEncodedBytes: 65_536 };

/**
 * Creates the realtime conformance harness for one provider.
 * @param options - Provider factory and optional failing provider.
 * @returns Cases and a runner; pass it to `runConformance` or run each case as a test.
 * @example
 * ```ts
 * import { runConformance } from "@relkit/testing/conformance";
 * import { createRealtimeConformanceHarness } from "@relkit/testing/realtime-conformance";
 * import { createLocalRealtimeProvider } from "relkit/providers-local";
 *
 * const harness = createRealtimeConformanceHarness({
 *   create: () => createLocalRealtimeProvider("/tmp/relkit-realtime-conformance", { pollingMs: 50 }),
 * });
 * console.log((await runConformance(harness)).passed);
 * ```
 */
export function createRealtimeConformanceHarness(
  options: RealtimeConformanceOptions,
): ConformanceHarness<RealtimeConformanceCaseId> {
  const run = `conformance-${Math.random().toString(36).slice(2, 10)}`;
  const pair =
    (caseId: string, body: (reader: Instance, writer: Instance) => Promise<void>) => async () => {
      const profile = `${run}-${caseId}`;
      const providers = [options.create(profile), options.create(profile)] as const;
      await Promise.all(providers.map((provider) => provider.ready?.()));
      try {
        const scope = await scopeFor(providers[0], profile);
        await body(instance(providers[0], scope), instance(providers[1], scope));
      } finally {
        await Promise.all(providers.map((provider) => provider.close?.()));
      }
    };
  return conformanceHarness("realtime", REALTIME_CONFORMANCE_CASES, {
    "wake-on-append": pair("wake", async (reader, writer) => {
      const initial = await reader.provider.readAfter({ ...reader.scope, ...READ });
      const waiting = reader.provider.waitAfter({
        ...reader.scope,
        after: initial.checkpoint,
        deadlineMs: Date.now() + 5_000,
        signal: new AbortController().signal,
      });
      const started = Date.now();
      await writer.append({ ok: true });
      await waiting;
      check(Date.now() - started < 4_500, "the waiter wakes before its deadline");
    }),
    "read-after-checkpoint": pair("checkpoint", async (reader, writer) => {
      const first = await writer.append({ value: "first" });
      await writer.append({ value: "second" });
      const page = await reader.provider.readAfter({
        ...reader.scope,
        ...READ,
        after: first.checkpoint,
      });
      const values = page.events.map((event) => (event.payload as { value: string }).value);
      check(same(values, ["second"]), "only events after the checkpoint", values);
    }),
    "concurrent-appends": pair("concurrent", async (reader, writer) => {
      const initial = await reader.provider.readAfter({ ...reader.scope, ...READ });
      const values = Array.from({ length: 20 }, (_, index) => `concurrent-${index}`);
      await Promise.all(
        values.map((value, index) => (index % 2 === 0 ? reader : writer).append({ value })),
      );
      const page = await reader.provider.readAfter({
        ...reader.scope,
        ...READ,
        after: initial.checkpoint,
      });
      const seen = page.events.map((event) => (event.payload as { value: string }).value).sort();
      check(same(seen, [...values].sort()), "every concurrent append lands", seen);
    }),
    "idempotent-append": pair("idempotent", async (reader, writer) => {
      const operationId = createOperationId();
      const receipt = { operationId, semanticDigest: "same-event" };
      const first = await writer.append({ value: "once" }, receipt);
      const second = await reader.append({ value: "once" }, receipt);
      check(first.duplicate === false && second.duplicate === true, "the repeat is a duplicate", [
        first,
        second,
      ]);
      check(first.eventId === second.eventId, "both receipts name one event", [first, second]);
    }),
    "wait-deadline": pair("deadline", async (reader) => {
      const initial = await reader.provider.readAfter({ ...reader.scope, ...READ });
      const started = Date.now();
      await reader.provider.waitAfter({
        ...reader.scope,
        after: initial.checkpoint,
        deadlineMs: started + 200,
        signal: new AbortController().signal,
      });
      check(Date.now() - started < 3_000, "the wait settles near its deadline");
    }),
    presence: pair("presence", async (reader, writer) => {
      const lease = {
        ...writer.scope,
        leaseId: "lease-1",
        connectionId: "connection-1",
        opaqueMemberId: "member-1",
        expiresAt: new Date(Date.now() + 45_000).toISOString(),
        maxMembers: 100,
        maxConnections: 100,
      };
      await writer.provider.acquirePresence(lease);
      const seen = await reader.provider.readPresence({ ...reader.scope, maxMembers: 100 });
      check(seen.connections === 1, "the other instance sees the lease", seen);
      const { expiresAt: _expiresAt, ...release } = lease;
      await writer.provider.releasePresence(release);
      const after = await reader.provider.readPresence({ ...reader.scope, maxMembers: 100 });
      check(after.connections === 0, "the released lease is gone", after);
    }),
    "backend-failure": async () => {
      if (options.failing === undefined) return SKIPPED;
      const provider = options.failing();
      try {
        await rejects(() => provider.getEpoch(), "getEpoch on a failing backend");
      } finally {
        await provider.close?.().catch(() => undefined);
      }
    },
  });
}

interface Instance {
  readonly provider: RealtimeConformanceProvider;
  readonly scope: RealtimeScope;
  readonly append: (
    payload: unknown,
    receipt?: Pick<AppendChannelEvent, "operationId" | "semanticDigest">,
  ) => ReturnType<RealtimeConformanceProvider["append"]>;
}

async function scopeFor(provider: RealtimeConformanceProvider, profile: string) {
  return {
    applicationId: "relkit-conformance",
    environment: "test",
    profile,
    providerEpoch: await provider.getEpoch(),
    channelId: "orders",
    partition: "one",
    identityScope: "owner",
    sessionEpoch: "session",
    policyEpoch: "policy",
  } as RealtimeScope;
}

function instance(provider: RealtimeConformanceProvider, scope: RealtimeScope): Instance {
  return {
    provider,
    scope,
    append: (payload, receipt) =>
      provider.append({
        ...scope,
        event: "changed",
        payload,
        encodedBytes: 128,
        occurredAt: new Date().toISOString(),
        retentionMs: 300_000,
        maxEvents: 100,
        limits: LIMITS,
        ...(receipt === undefined
          ? {}
          : { ...receipt, receiptExpiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      }),
  };
}
