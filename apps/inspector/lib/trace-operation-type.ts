import type { InspectorObject } from "./api-types";

export function traceOperationType(span: InspectorObject): string {
  const name = text(span.name);
  const kind = text(span.spanKind) || text(span.kind);
  const source = text(span.source);
  if (kind === "server") return "route";
  if (name.startsWith("relkit.middleware.")) return "middleware";
  if (name.startsWith("relkit.invoke.")) return "function";
  if (name.startsWith("relkit.database.")) return "database call";
  if (name.startsWith("relkit.cache.")) return "cache call";
  if (name.startsWith("relkit.bucket.")) return "bucket call";
  if (name.startsWith("relkit.tool.")) return "tool call";
  if (name.startsWith("relkit.agent.")) return "agent call";
  if (name.startsWith("relkit.event.") || source.startsWith("event")) return "event";
  if (name.startsWith("relkit.job.") || source === "job") return "job";
  if (name.startsWith("relkit.schedule.")) return "schedule";
  if (name.startsWith("relkit.client.")) return "outbound HTTP";
  if (kind === "producer" || kind === "consumer") return kind;
  return kind === "client" ? "client call" : "operation";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
