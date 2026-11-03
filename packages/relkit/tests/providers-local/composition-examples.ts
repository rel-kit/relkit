import { Effect, Layer } from "effect";
import { LocalCacheService, localCacheLayer } from "../../src/providers-local/cache/provider.js";
import {
  LocalBucketService,
  localBucketLayer,
} from "../../src/providers-local/buckets/provider.js";
import {
  LocalAgentStateService,
  agentStateLayer,
} from "../../src/providers-local/agent-state/provider.js";
import {
  LocalRealtimeService,
  realtimeLayer,
} from "../../src/providers-local/realtime/provider.js";
import { LocalJobStoreService, jobStoreLayer } from "../../src/providers-local/jobs/store.js";
import {
  LocalNativeJobService,
  nativeJobLayer,
} from "../../src/providers-local/jobs/native.service.js";
import { LocalEventService, localEventLayer } from "../../src/providers-local/events/provider.js";
import { CacheTest, RealtimeTest } from "./effect/fixtures.js";
import { LocalSchedulerService, schedulerLayer } from "../../src/providers-local/jobs/scheduler.js";
import {
  LocalLegacyJobService,
  legacyJobLayer,
  LocalObservabilityService,
  localObservabilityLayer,
} from "../../src/providers-local/runtime-capabilities.service.js";

/** Checked scheduler setup owns registrations but starts no automatic worker. */
export const scheduledWork = Effect.gen(function* () {
  const scheduler = yield* LocalSchedulerService;
  return yield* scheduler.runDue();
}).pipe(Effect.provide(schedulerLayer()));

/** Checked legacy profile setup closes acquired journals with its Layer scope. */
export const legacyQueue = (root: string) =>
  Effect.gen(function* () {
    const jobs = yield* LocalLegacyJobService;
    return yield* jobs.createQueue({ jobId: "example" });
  }).pipe(Effect.provide(legacyJobLayer(root, "demo")));

/** The sink is intentionally uninstrumented to avoid recursive collection. */
export const collectedRecords = Effect.gen(function* () {
  const sink = yield* LocalObservabilityService;
  yield* sink.collect({ message: "example" });
  return yield* sink.read();
}).pipe(Effect.provide(localObservabilityLayer));

/** Checked composition: live storage and cache share the caller's Clock and logger. */
export const cacheAndBucket = (root: string) =>
  Effect.gen(function* () {
    const cache = yield* LocalCacheService;
    const bucket = yield* LocalBucketService;
    yield* bucket.put("hello.txt", new TextEncoder().encode("hello"));
    yield* cache.set("hello-size", (yield* bucket.head("hello.txt"))?.size);
    return yield* cache.get("hello-size");
  }).pipe(Effect.provide(Layer.merge(localCacheLayer(), localBucketLayer({ root }))));

/** Checked composition: each state domain keeps its own persistence root and epoch. */
export const stateEpochs = (root: string) =>
  Effect.gen(function* () {
    const agents = yield* LocalAgentStateService;
    const realtime = yield* LocalRealtimeService;
    return yield* Effect.all([agents.getEpoch(), realtime.getEpoch()]);
  }).pipe(
    Effect.provide(
      Layer.merge(agentStateLayer(`${root}/agents`), realtimeLayer(`${root}/realtime`)),
    ),
  );

/** Checked composition: scopes finalize the event worker and native/durable journals. */
export const executionLayers = (root: string) =>
  Effect.gen(function* () {
    const journal = yield* LocalJobStoreService;
    const jobs = yield* LocalNativeJobService;
    const events = yield* LocalEventService;
    yield* events.health();
    return {
      checkpoint: (yield* journal.snapshot()).checkpoint,
      capabilities: jobs.metadata.capabilities,
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        jobStoreLayer(`${root}/journal`),
        nativeJobLayer(root, "example"),
        localEventLayer(`${root}/events`),
      ),
    ),
  );

/** Checked substitution: callers use unchanged tags with deterministic in-memory owners. */
export const testComposition = Effect.gen(function* () {
  const cache = yield* LocalCacheService;
  const realtime = yield* LocalRealtimeService;
  yield* cache.set("epoch", yield* realtime.getEpoch());
  return yield* cache.get("epoch");
}).pipe(Effect.provide(Layer.merge(CacheTest, RealtimeTest)));
