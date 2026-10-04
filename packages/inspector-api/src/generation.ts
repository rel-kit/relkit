import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "./native-edge.js";
import { inspectorExecution } from "./execution.js";
import { nativeAttempt } from "./native-edge.js";
import { isRuntimeActivationFingerprint } from "@relkit/contracts";
import type { InspectorActionServices } from "./actions.js";
import {
  isRecord,
  resolveService,
  resolveValue,
  stringValue,
  type ActiveGenerationOptions,
  type InspectorRuntimeServices,
  type InspectorValueSource,
  type ResolvedActiveGeneration,
} from "./shared.js";
import type { InspectorCandidateGeneration } from "./generation.types.js";
import type { InspectorResourceExplorers } from "./resource-explorer.js";
import type { InspectorJobsServices } from "./jobs/types.js";

/**
 * Resolves the authoritative active generation and declared native service sources in order.
 * @param options - Configured native authorities and ownership policy.
 * @returns A lazy observed Effect containing a compatible resolved active generation, or undefined when its identity is unavailable.
 */
export const resolveActiveGenerationEffect = Effect.fn("Inspector.resolveActiveGeneration")(
  function* (options: ActiveGenerationOptions) {
    const source = options.getActiveGeneration ?? options.activeGeneration ?? options.generation;
    const value = yield* nativeAttempt(() => resolveValue(source));
    if (!isRecord(value)) return undefined;
    const services = isRecord(value.services) ? value.services : {};
    const graphSource = value.graph ?? services.graph;
    const sourceGraphHash = isRecord(graphSource) ? stringValue(graphSource.graphHash) : undefined;
    const graphService = yield* nativeAttempt(() => resolveService(graphSource));
    const generationId = stringValue(value.generationId) ?? stringValue(value.id);
    if (
      value.activationFingerprint !== undefined &&
      !isRuntimeActivationFingerprint(value.activationFingerprint)
    )
      return undefined;
    const activationFingerprint = value.activationFingerprint;
    const graphHash =
      stringValue(value.graphHash) ??
      sourceGraphHash ??
      (isRecord(graphService) ? stringValue(graphService.graphHash) : undefined) ??
      activationFingerprint?.graphHash;
    if (generationId === undefined || graphHash === undefined) return undefined;
    if (activationFingerprint !== undefined && graphHash !== activationFingerprint.graphHash)
      return undefined;
    const descriptors = yield* nativeAttempt(() =>
      resolveService(value.descriptors ?? services.descriptors),
    );
    const diagnostics = yield* nativeAttempt(() =>
      resolveService(value.diagnostics ?? services.diagnostics),
    );
    const observedEdges = yield* nativeAttempt(() =>
      resolveService(value.observedEdges ?? services.observedEdges),
    );
    const integrations = yield* nativeAttempt(() =>
      resolveService(value.integrations ?? services.integrations),
    );
    const localServices = yield* nativeAttempt(() =>
      resolveService(value.localServices ?? services.localServices),
    );
    const telemetry = yield* nativeAttempt(() =>
      resolveService(value.telemetry ?? services.telemetry),
    );
    const actions = yield* nativeAttempt(() =>
      resolveValue(
        (value.actions ?? services.actions) as
          InspectorValueSource<InspectorActionServices | undefined> | undefined,
      ),
    );
    const resources = yield* nativeAttempt(() =>
      resolveValue(
        (value.resources ?? services.resources) as
          InspectorValueSource<InspectorResourceExplorers | undefined> | undefined,
      ),
    );
    const jobsSource =
      value.jobs ??
      (isRecord(services.jobs) && "bindings" in services.jobs ? services.jobs : undefined);
    const jobs = yield* nativeAttempt(() =>
      resolveValue(
        jobsSource as InspectorValueSource<InspectorJobsServices | undefined> | undefined,
      ),
    );
    const runtime = value.runtime ?? services.runtime ?? directRuntime(value, services);
    const candidateSource =
      value.candidateGeneration ??
      value.candidate ??
      services.candidateGeneration ??
      services.candidate;
    const candidate = yield* resolveCandidateEffect(candidateSource);
    return {
      generationId,
      graphHash,
      ...(activationFingerprint === undefined ? {} : { activationFingerprint }),
      ...(unwrapGraph(graphService) === undefined ? {} : { graph: unwrapGraph(graphService) }),
      ...(descriptors === undefined ? {} : { descriptors }),
      ...(diagnostics === undefined ? {} : { diagnostics }),
      ...(observedEdges === undefined ? {} : { observedEdges }),
      ...(integrations === undefined ? {} : { integrations }),
      ...(localServices === undefined ? {} : { localServices }),
      ...(telemetry === undefined ? {} : { telemetry }),
      ...(runtime === undefined ? {} : { runtime: runtime as InspectorRuntimeServices }),
      ...(jobs === undefined ? {} : { jobs }),
      ...(actions === undefined ? {} : { actions }),
      ...(resources === undefined ? {} : { resources }),
      ...(candidate === undefined ? {} : { candidate }),
    };
  },
  (effect) => observeExecution("inspector", "resolveActiveGeneration", effect),
);

/**
 * Resolves the authoritative active generation and declared native service sources in order.
 * @param options - Configured native authorities and ownership policy.
 * @returns A compatible resolved active generation, or undefined when its identity is unavailable.
 */
export function resolveActiveGeneration(
  options: ActiveGenerationOptions,
): Promise<ResolvedActiveGeneration | undefined> {
  return runExecutionPromise(inspectorExecution, resolveActiveGenerationEffect(options));
}

/**
 * Resolves candidate metadata separately from active runtime authorities.
 * @param source - Native or stored source whose public value is resolved selectively.
 * @returns A lazy observed Effect containing candidate identity and diagnostics without activating candidate services.
 */
const resolveCandidateEffect = Effect.fn("Inspector.resolveCandidate")(
  function* (source: unknown) {
    const value = yield* nativeAttempt(() =>
      resolveValue(source as InspectorCandidateGeneration | (() => unknown) | undefined),
    );
    if (!isRecord(value)) return undefined;
    const services = isRecord(value.services) ? value.services : {};
    const graphSource = value.graph ?? services.graph;
    const sourceGraphHash = isRecord(graphSource) ? stringValue(graphSource.graphHash) : undefined;
    const graphService = yield* nativeAttempt(() => resolveService(graphSource));
    const diagnostics = yield* nativeAttempt(() =>
      resolveService(value.diagnostics ?? services.diagnostics),
    );
    const generationId = stringValue(value.generationId) ?? stringValue(value.id);
    if (
      value.activationFingerprint !== undefined &&
      !isRuntimeActivationFingerprint(value.activationFingerprint)
    )
      return undefined;
    const activationFingerprint = value.activationFingerprint;
    const graphHash =
      stringValue(value.graphHash) ??
      sourceGraphHash ??
      (isRecord(graphService) ? stringValue(graphService.graphHash) : undefined) ??
      activationFingerprint?.graphHash;
    const sourceVersion = safeInteger(value.sourceVersion);
    const state = stringValue(value.state);
    const status = stringValue(value.status);
    if (
      activationFingerprint !== undefined &&
      graphHash !== undefined &&
      graphHash !== activationFingerprint.graphHash
    )
      return undefined;
    if (
      generationId === undefined &&
      graphHash === undefined &&
      graphService === undefined &&
      diagnostics === undefined &&
      sourceVersion === undefined &&
      state === undefined &&
      status === undefined
    )
      return undefined;
    return {
      ...(generationId === undefined ? {} : { generationId }),
      ...(graphHash === undefined ? {} : { graphHash }),
      ...(activationFingerprint === undefined ? {} : { activationFingerprint }),
      ...(sourceVersion === undefined ? {} : { sourceVersion }),
      ...(state === undefined ? {} : { state }),
      ...(status === undefined ? {} : { status }),
      ...(unwrapGraph(graphService) === undefined ? {} : { graph: unwrapGraph(graphService) }),
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
  },
  (effect) => observeExecution("inspector", "resolveCandidate", effect),
);

/**
 * Selects declared runtime collection authorities from a generation.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param services - Declared generation service sources selected in the established precedence.
 * @returns The existing runtime authority set without private traversal.
 */
function directRuntime(
  value: Record<string, unknown>,
  services: Record<string, unknown>,
): InspectorRuntimeServices {
  return Object.fromEntries(
    ["functions", "jobs", "events", "buckets", "cache", "caches", "tools", "agents"].flatMap(
      (key) => {
        const service = value[key] ?? services[key];
        return service === undefined ? [] : [[key, service]];
      },
    ),
  ) as InspectorRuntimeServices;
}

/**
 * Accepts either a stored graph or the existing graph wrapper shape.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns The selected graph value.
 */
function unwrapGraph(value: unknown): unknown {
  return isRecord(value) && value.graph !== undefined ? value.graph : value;
}

/**
 * Accepts only finite safe integer generation metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A safe integer or undefined.
 */
function safeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}
