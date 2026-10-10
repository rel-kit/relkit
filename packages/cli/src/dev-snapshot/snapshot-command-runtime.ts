/**
 * Composes the small prepared-development graph at the native command edge.
 * Snapshot hits acquire no evaluator, compiler, bundler or local-service module;
 * fallback authorities import lazily when the existing supervisor receives edits.
 */
import { Layer } from "effect";
import { devSessionCapabilitiesLayer } from "../commands/dev-session-engine.js";
import { snapshotFilesLive } from "./snapshot-files.service.js";
import { snapshotEpochsLive } from "./snapshot-epoch.service.js";
import { devSnapshotsLive } from "./snapshot.service.js";
import { snapshotCandidateFilesLive } from "./snapshot-candidate-files.js";
import { snapshotCandidatesLive } from "./snapshot-candidate.service.js";
import { snapshotProbeLive } from "./snapshot-probe.service.js";
import { snapshotFallbackLive } from "./snapshot-fallback.service.js";
import { snapshotSessionCompilersLive } from "./snapshot-session-compiler.service.js";
import { httpLayer } from "../services/http.service.js";
import { telemetryListenerLayer } from "../commands/dev-telemetry-listener.service.js";
import { telemetryStorageLayer } from "../commands/dev-telemetry-storage.service.js";
import { telemetryRelaysLayer } from "../commands/dev-telemetry-relay.service.js";

const authorities = Layer.mergeAll(
  devSessionCapabilitiesLayer,
  snapshotFilesLive,
  snapshotEpochsLive,
  snapshotCandidateFilesLive,
  snapshotFallbackLive,
  snapshotProbeLive,
  httpLayer,
  telemetryListenerLayer,
);
const support = telemetryStorageLayer.pipe(Layer.provideMerge(authorities));
const policies = Layer.mergeAll(
  devSnapshotsLive,
  snapshotCandidatesLive,
  telemetryRelaysLayer,
).pipe(Layer.provideMerge(support));

/** One memoized live graph exposes session policy and its shared native authorities. */
export const preparedDevRuntime = snapshotSessionCompilersLive.pipe(Layer.provideMerge(policies));
