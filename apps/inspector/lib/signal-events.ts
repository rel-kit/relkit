/** Selects durable-record invalidations consumed by both signal list views. */
export function signalEventTypes(kind: "requests" | "logs" | "traces"): readonly string[] {
  return kind === "requests"
    ? ["request.started", "request.completed"]
    : kind === "logs"
      ? ["log.emitted"]
      : ["span.started", "span.updated", "span.completed", "request.completed"];
}
