import { buildGraph } from "./normalize-graph.js";
import { jobCompatible, schema, schemaEquivalent } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { routeCollisionKeys, validateHttpCompatibility } from "./normalize-http-validation.js";
import { validateEventCompatibility } from "./normalize-event-validation.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";
import { validateJobNames } from "./jobs/names.js";
import { validateJobRequirements } from "./jobs/diagnostics.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
export function passRoutes(work: NormalizationWork): void {
  validateHttpCompatibility(work);
}
export function passJobs(work: NormalizationWork): void {
  validateJobNames(work);
  validateLegacyJobs(work);
  for (const descriptor of work.descriptors.filter((entry) => entry.kind === "job")) {
    const value = descriptor.value as Record<string, any>;
    if (value.task !== undefined) continue;
    const target = referenceFor(work, value.target, "function");
    const reason = jobCompatible(
      value.input,
      isRecord(target?.value) ? target.value.input : undefined,
    );
    if (reason !== undefined) add(work, descriptor, NORMALIZE_CODES.jobInput, reason);
  }
  validateJobRequirements(work);
}

function validateLegacyJobs(work: NormalizationWork): void {
  const application = work.descriptors.find((entry) => entry.kind === "app");
  if (application === undefined) return;
  const applicationValue = isRecord(application.value) ? application.value : {};
  const compatibility = isRecord(applicationValue.compatibility)
    ? applicationValue.compatibility
    : {};
  if (compatibility.legacyJobs === true) return;
  for (const job of work.descriptors.filter((entry) => entry.kind === "job")) {
    const value = isRecord(job.value) ? job.value : {};
    if (isRecord(value.task)) continue;
    add(
      work,
      job,
      NORMALIZE_CODES.legacyJobs,
      "Legacy function-target jobs require compatibility.legacyJobs to be enabled.",
      "error",
      undefined,
      "Set defineApp({ compatibility: { legacyJobs: true } }) during the migration window.",
    );
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
      if (isNativeAgentTool(tool)) continue;
      const toolId = refId(tool);
      const resolved =
        toolId === undefined ? undefined : work.referencesByKind.get("tool")?.get(toolId);
      if (refKind(tool) !== "tool" || toolId === undefined || resolved === undefined)
        add(
          work,
          descriptor,
          NORMALIZE_CODES.agentTool,
          "Agent tool reference does not resolve to a tool.",
        );
      else if (
        value.client !== undefined &&
        isRecord(resolved.value) &&
        resolved.value.approval !== "never" &&
        (!Array.isArray(value.controls) || !value.controls.includes("approve"))
      )
        add(
          work,
          descriptor,
          NORMALIZE_CODES.agentControl,
          'Client-exposed agents with approval-requiring tools must declare the "approve" control.',
        );
    }
  }
}
function isNativeAgentTool(value: unknown): boolean {
  return (
    isRecord(value) &&
    ((typeof value.name === "string" && value.schema !== undefined) ||
      typeof value.type === "string")
  );
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
  if (hasPublicTaskJobs(work)) {
    for (const descriptor of descriptors) {
      if (descriptor.id !== "jobs") continue;
      add(
        work,
        descriptor,
        NORMALIZE_CODES.collision,
        'Route selector "jobs" collides with the generated client jobs namespace.',
        "error",
      );
    }
  }
}

function hasPublicTaskJobs(work: NormalizationWork): boolean {
  return work.descriptors.some((descriptor) => {
    if (descriptor.kind !== "job") return false;
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    const client = isRecord(value.client) ? value.client : undefined;
    return isRecord(value.task) && Array.isArray(client?.operations) && client.operations.length > 0;
  });
}
function compareDescriptors(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    left.id.localeCompare(right.id) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}
export function passGraph(work: NormalizationWork): void {
  work.graph = buildGraph(work);
}
