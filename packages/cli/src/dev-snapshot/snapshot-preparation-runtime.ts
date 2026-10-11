/**
 * Composes finite preparation at the native command edge. Resourceful CLI adapters
 * and snapshot policies share one Layer memoization graph; service workflows only
 * consume captured contracts, and caller cancellation joins their owned cleanup.
 */
import { Effect, Layer } from "effect";
import { runCliEffect } from "../cli-runtime.js";
import { buildCapabilitiesLayer } from "../services/project-capabilities.js";
import { snapshotFilesLive } from "./snapshot-files.service.js";
import { snapshotPublicationNativeLive } from "./snapshot-publication-native.js";
import { snapshotEpochsLive } from "./snapshot-epoch.service.js";
import { snapshotDependenciesLive } from "./snapshot-dependencies.service.js";
import { snapshotPublicationLive } from "./snapshot-publication.service.js";
import { snapshotCompilationLive } from "./snapshot-compilation.service.js";
import { SnapshotPreparation, snapshotPreparationLive } from "./snapshot-preparation.service.js";
import type { SnapshotPreparationRequest } from "./snapshot-preparation.types.js";

const authorities = Layer.mergeAll(
  buildCapabilitiesLayer,
  snapshotFilesLive,
  snapshotPublicationNativeLive,
  snapshotEpochsLive,
);
const policies = Layer.mergeAll(
  snapshotDependenciesLive,
  snapshotPublicationLive,
  snapshotCompilationLive,
).pipe(Layer.provideMerge(authorities));

/** Shared live graph with preparation as its intentional exposed service. */
export const snapshotPreparationRuntime = snapshotPreparationLive.pipe(Layer.provide(policies));

/**
 * Prepares one installed project without opening backend or support listeners.
 * @param request - Project root, actual tool versions and generated probe policy.
 * @param signal - Optional invocation cancellation, joined through resource scopes.
 * @returns Prepared content address after atomic publication or original typed failure.
 */
export function prepareGeneratedDevSnapshot(
  request: SnapshotPreparationRequest,
  signal?: AbortSignal,
) {
  return runCliEffect(
    Effect.flatMap(SnapshotPreparation, (service) => service.prepare(request)),
    snapshotPreparationRuntime,
    signal,
  );
}
