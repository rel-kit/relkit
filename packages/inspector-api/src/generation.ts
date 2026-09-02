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
import type {
  InspectorCandidateGeneration,
  ResolvedCandidateGeneration,
} from "./generation-types.js";
import type { InspectorResourceExplorers } from "./resource-explorer.js";

export async function resolveActiveGeneration(
  options: ActiveGenerationOptions,
): Promise<ResolvedActiveGeneration | undefined> {
  const source = options.getActiveGeneration ?? options.activeGeneration ?? options.generation;
  const value = await resolveValue(source);
  if (!isRecord(value)) return undefined;
  const services = isRecord(value.services) ? value.services : {};
  const graphSource = value.graph ?? services.graph;
  const sourceGraphHash = isRecord(graphSource) ? stringValue(graphSource.graphHash) : undefined;
  const graphService = await resolveService(graphSource);
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
  const descriptors = await resolveService(value.descriptors ?? services.descriptors);
  const diagnostics = await resolveService(value.diagnostics ?? services.diagnostics);
  const observedEdges = await resolveService(value.observedEdges ?? services.observedEdges);
  const integrations = await resolveService(value.integrations ?? services.integrations);
  const localServices = await resolveService(value.localServices ?? services.localServices);
  const telemetry = await resolveService(value.telemetry ?? services.telemetry);
  const actions = await resolveValue(
    (value.actions ?? services.actions) as
      InspectorValueSource<InspectorActionServices | undefined> | undefined,
  );
  const resources = await resolveValue(
    (value.resources ?? services.resources) as
      InspectorValueSource<InspectorResourceExplorers | undefined> | undefined,
  );
  const runtime = value.runtime ?? services.runtime ?? directRuntime(value, services);
  const candidateSource =
    value.candidateGeneration ??
    value.candidate ??
    services.candidateGeneration ??
    services.candidate;
  const candidate = await resolveCandidate(candidateSource);
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
    ...(actions === undefined ? {} : { actions }),
    ...(resources === undefined ? {} : { resources }),
    ...(candidate === undefined ? {} : { candidate }),
  };
}

async function resolveCandidate(source: unknown): Promise<ResolvedCandidateGeneration | undefined> {
  const value = await resolveValue(
    source as InspectorCandidateGeneration | (() => unknown) | undefined,
  );
  if (!isRecord(value)) return undefined;
  const services = isRecord(value.services) ? value.services : {};
  const graphSource = value.graph ?? services.graph;
  const sourceGraphHash = isRecord(graphSource) ? stringValue(graphSource.graphHash) : undefined;
  const graphService = await resolveService(graphSource);
  const diagnostics = await resolveService(value.diagnostics ?? services.diagnostics);
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
}

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

function unwrapGraph(value: unknown): unknown {
  return isRecord(value) && value.graph !== undefined ? value.graph : value;
}

function safeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}
