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
): Set<Capability> {
  const used = new Set<Capability>(["observability"]);
  for (const node of nodes) {
    if (node.kind === "job" || node.kind === "bucket" || node.kind === "cache")
      used.add(node.kind === "bucket" ? "buckets" : node.kind === "cache" ? "cache" : "jobs");
    if (node.kind === "event" || (node.kind === "trigger" && node.triggerType === "event"))
      used.add("events");
    if (node.kind === "agent") used.add("models");
    if (
      node.kind === "trigger" &&
      (node.triggerType === "queue" || node.triggerType === "schedule")
    )
      used.add("jobs");
  }
  for (const edge of edges)
    if (edge.kind === "publishes-event" || edge.kind === "listens-to-event") used.add("events");
  return used;
}
