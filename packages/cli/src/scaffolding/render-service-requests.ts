/**
 * Builds typed artifact requests and closes service include prerequisites before
 * bundle planning. These pure calculations preserve the original request owner,
 * installation policy and supported capability relationships.
 */

import type { AddRequest, ServiceInclude } from "create-relkit/internal/add-types";
import type { PlanBuilder } from "./plan-builder.js";

/** Artifacts in the existing explicit full service preset. */
export const FULL_SERVICE: readonly ServiceInclude[] = [
  "function",
  "event-function",
  "task",
  "error",
  "event",
  "job",
  "cache",
  "bucket",
  "tool",
  "prompt",
  "agent",
  "constants",
  "route",
];

/**
 * Adds the prerequisite declarations needed by selected bundle capabilities.
 * @param input - Requested service-owned artifact kinds.
 * @returns Requested kinds and their existing function/event/tool/prompt prerequisites.
 */
export function serviceIncludes(input: readonly ServiceInclude[]): Set<ServiceInclude> {
  const selected = new Set(input);
  if ((["error", "job", "tool", "route"] as const).some((kind) => selected.has(kind)))
    selected.add("function");
  if (selected.has("event-function")) selected.add("event");
  if (selected.has("agent")) {
    selected.add("function");
    selected.add("tool");
    selected.add("prompt");
  }
  return selected;
}

/**
 * Builds a kind-specific request using the original transaction's common fields.
 * @typeParam Kind - Discriminant of the selected artifact request.
 * @param builder - Per-request planning owner.
 * @param kind - Artifact kind selected by its renderer.
 * @param options - Complete variant-specific request fields.
 * @returns The same variant with preserved project-root and installation policy.
 */
export function serviceRequest<Kind extends AddRequest["kind"]>(
  builder: PlanBuilder,
  kind: Kind,
  options: Omit<Extract<AddRequest, { kind: Kind }>, "kind" | "projectRoot" | "install">,
): Extract<AddRequest, { kind: Kind }> {
  // Options omit all three injected keys and are constrained to this exact
  // discriminant; TypeScript cannot reduce the generic Extract at construction.
  return {
    kind,
    projectRoot: builder.discovery.projectRoot,
    install: builder.request.install,
    ...options,
  } as Extract<AddRequest, { kind: Kind }>;
}

/**
 * Preserves the task execution model selected by the existing default job adapter.
 * @param builder - Planning owner with discovered provider defaults.
 * @returns Retryable for effect-mq, otherwise the existing durable model.
 */
export function serviceTaskExecution(builder: PlanBuilder): "durable" | "retryable" {
  const profile = builder.profiles.find((item) => item.capability === "job" && item.isDefault);
  return profile?.adapter?.includes("effectMq") ? "retryable" : "durable";
}
