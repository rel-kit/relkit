import type { ApplicationGraph, GraphNode } from "@zsys/graph";
import type { Capability } from "./from-graph-validation.js";

export function iam(name: Capability, id: string, edges: ApplicationGraph["edges"]): string[] {
  const linked = (kind: string) => edges.some((edge) => edge.kind === kind && edge.to === id);
  if (name === "buckets" && linked("uses-bucket"))
    return ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"];
  if (name === "jobs")
    return [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      ...(linked("enqueues-job") ? ["sqs:SendMessage"] : []),
    ];
  if (name === "events" && linked("publishes-event")) return ["events:PutEvents"];
  if (name === "cache" && linked("uses-cache")) return ["elasticache:Connect"];
  return [];
}

export function usedCapabilities(
  nodes: readonly GraphNode[],
  edges: ApplicationGraph["edges"],
): readonly { readonly capability: Capability; readonly profile: string }[] {
  const used = new Map<string, { capability: Capability; profile: string }>();
  const add = (capability: Capability, profile = "default") => {
    used.set(`${capability}\0${profile}`, { capability, profile });
  };
  for (const node of nodes) {
    if (node.kind === "job") add("jobs", node.profile);
    if (node.kind === "bucket") add("buckets", node.profile);
    if (node.kind === "cache") add("cache", node.profile);
    if (node.kind === "event") add("events");
    if (node.kind === "agent") add("models");
    if (node.kind === "trigger" && node.triggerType === "event") {
      const profile =
        node.config !== null &&
        typeof node.config === "object" &&
        !Array.isArray(node.config) &&
        typeof (node.config as { readonly profile?: unknown }).profile === "string"
          ? (node.config as { readonly profile: string }).profile
          : "default";
      add("events", profile);
    }
    if (
      node.kind === "trigger" &&
      (node.triggerType === "queue" || node.triggerType === "schedule")
    )
      add("jobs");
  }
  for (const edge of edges)
    if (edge.kind === "publishes-event" || edge.kind === "listens-to-event") add("events");
  return [...used.values()];
}
