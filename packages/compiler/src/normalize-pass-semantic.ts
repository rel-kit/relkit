import { buildGraph } from "./normalize-graph.js";
import { jobCompatible, providerProfiles, schema, schemaEquivalent } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { routeCollisionKeys, validateHttpCompatibility } from "./normalize-http-validation.js";
import { validateEventCompatibility } from "./normalize-event-validation.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";
import { requestedProviderProfile, selectedProviderProfile } from "./normalize-graph-app.js";
import {
  validateProviderReleaseSources,
  validateProviderSingletons,
  validateUniqueBucketProfiles,
} from "./normalize-provider-validation.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
export function passRoutes(work: NormalizationWork): void {
  validateHttpCompatibility(work);
}
export function passJobs(work: NormalizationWork): void {
  for (const descriptor of work.descriptors.filter((entry) => entry.kind === "job")) {
    const value = descriptor.value as Record<string, any>;
    const target = referenceFor(work, value.target, "function");
    const reason = jobCompatible(
      value.input,
      isRecord(target?.value) ? target.value.input : undefined,
    );
    if (reason !== undefined) add(work, descriptor, NORMALIZE_CODES.jobInput, reason);
  }
}
export function passEvents(work: NormalizationWork): void {
  validateEventCompatibility(work);
}
export function passEventTargets(work: NormalizationWork): void {
  return;
}
export function passTools(work: NormalizationWork): void {
  for (const descriptor of work.descriptors.filter((entry) => entry.kind === "tool")) {
    const value = descriptor.value as Record<string, any>;
    const target = referenceFor(work, value.target, "function");
    if (refKind(value.target) !== "function" || target?.kind !== "function")
      add(work, descriptor, NORMALIZE_CODES.toolTarget, "Tool target must resolve to a function.");
    else if (
      isRecord(target.value) &&
      isRecord(value.target) &&
      schema(value.target.input).ok &&
      schema(target.value.input).ok &&
      schema(value.target.output).ok &&
      schema(target.value.output).ok &&
      ((value.target.input !== undefined &&
        !schemaEquivalent(value.target.input, target.value.input)) ||
        (value.target.output !== undefined &&
          !schemaEquivalent(value.target.output, target.value.output)))
    ) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.toolTarget,
        "Tool target schemas differ from its function.",
      );
    }
  }
}

export function passAgents(work: NormalizationWork): void {
  for (const descriptor of work.descriptors.filter((entry) => entry.kind === "agent")) {
    const value = descriptor.value as Record<string, any>;
    if (!Array.isArray(value.tools)) {
      add(work, descriptor, NORMALIZE_CODES.agentTool, "Agent tools must be an array.");
    }
    for (const tool of Array.isArray(value.tools) ? value.tools : []) {
      const toolId = refId(tool);
      if (
        refKind(tool) !== "tool" ||
        toolId === undefined ||
        work.referencesByKind.get("tool")?.get(toolId) === undefined
      )
        add(
          work,
          descriptor,
          NORMALIZE_CODES.agentTool,
          "Agent tool reference does not resolve to a tool.",
        );
    }
    if (value.model !== undefined && typeof value.model !== "string")
      add(work, descriptor, NORMALIZE_CODES.model, "Agent model must be serializable text.");
  }
}

export function passProviders(work: NormalizationWork): void {
  validateProviderSingletons(work);
  validateProviderReleaseSources(work);
  validateUniqueBucketProfiles(work);
  if (!work.descriptors.some((entry) => entry.kind === "app")) return;
  const profiles = providerProfiles({
    ...work.input,
    descriptors: work.descriptors.map((entry) => entry.value),
  });
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  for (const descriptor of work.descriptors) {
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    const profileCapability = capabilityFor(descriptor.kind);
    if (profileCapability !== undefined) {
      const selected = selectedProviderProfile(
        application,
        profileCapability,
        requestedProviderProfile(descriptor.kind, value),
      );
      if (selected === undefined) {
        add(
          work,
          descriptor,
          NORMALIZE_CODES.providerProfile,
          `Unqualified ${profileCapability} use requires a default when multiple profiles exist.`,
        );
        continue;
      }
      const capabilities = profiles.get(selected);
      if (capabilities === undefined || !capabilities.includes(profileCapability)) {
        add(
          work,
          descriptor,
          NORMALIZE_CODES.providerProfile,
          `Provider profile "${selected}" does not provide ${profileCapability}.`,
        );
      }
    }
  }
}

export function passCollisions(work: NormalizationWork): void {
  const routes = new Map<string, NormalizedDescriptor>();
  const descriptors = work.descriptors
    .filter((entry) => entry.kind === "route")
    .sort(compareDescriptors);
  for (const descriptor of descriptors) {
    const value = descriptor.value as Record<string, any>;
    for (const key of routeCollisionKeys(value)) {
      const previous = routes.get(key);
      if (previous === undefined) routes.set(key, descriptor);
      else if (previous.id !== descriptor.id)
        add(
          work,
          descriptor,
          NORMALIZE_CODES.collision,
          `Route collides with "${previous.id}" at ${key}.`,
          "error",
          previous,
        );
    }
  }
}

function compareDescriptors(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    left.id.localeCompare(right.id) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}

function capabilityFor(kind: string): string | undefined {
  return (
    {
      bucket: "bucket",
      cache: "cache",
      job: "job",
      event: "event",
      "event-trigger": "event",
      agent: "model",
    } as Record<string, string>
  )[kind];
}

export function passGraph(work: NormalizationWork): void {
  work.graph = buildGraph(work);
}
