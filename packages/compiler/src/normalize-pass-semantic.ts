import { buildGraph } from "./normalize-graph.js";
import { jobCompatible, providerProfiles, schema, schemaEquivalent } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { detectCycles } from "./normalize-cycles.js";
import { referenceFor } from "./normalize-reference-index.js";
import { routeCollisionKey, validateHttpCompatibility } from "./normalize-http-validation.js";
import { validateEventCompatibility } from "./normalize-event-validation.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";
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
    if (typeof value.modelProfile !== "string" || value.modelProfile.trim() === "")
      add(work, descriptor, NORMALIZE_CODES.modelProfile, "Agent model profile is required.");
  }
}

export function passProviders(work: NormalizationWork): void {
  const profiles = providerProfiles({
    ...work.input,
    descriptors: work.descriptors.map((entry) => entry.value),
  });
  for (const descriptor of work.descriptors) {
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    const profile = typeof value.profile === "string" ? value.profile : undefined;
    const model = typeof value.modelProfile === "string" ? value.modelProfile : undefined;
    const profileCapability = capabilityFor(descriptor.kind);
    if (profileCapability !== undefined) {
      const selected = profile ?? "default";
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
    if (model !== undefined && model.trim() !== "") {
      const capabilities = profiles.get(model);
      if (capabilities === undefined || !capabilities.includes("models"))
        add(
          work,
          descriptor,
          NORMALIZE_CODES.modelProfile,
          `Model profile "${model}" is not configured.`,
        );
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
    const key = routeCollisionKey(value);
    const previous = routes.get(key);
    if (previous === undefined) routes.set(key, descriptor);
    else
      add(
        work,
        descriptor,
        NORMALIZE_CODES.collision,
        `Route collides with "${previous.id}" at ${key}.`,
        "error",
        previous,
      );
  }
  detectCycles(work);
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
    { bucket: "buckets", cache: "cache", job: "jobs", "event-trigger": "events" } as Record<
      string,
      string
    >
  )[kind];
}

export function passGraph(work: NormalizationWork): void {
  work.graph = buildGraph(work);
}
