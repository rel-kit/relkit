import type { LogRecord, LogLevel } from "@relkit/runtime-effect";
import type { DevLogEvent } from "./dev.js";

const levels = new Set(["trace", "debug", "info", "warn", "error", "fatal"]);

export function devLogRecord(event: DevLogEvent) {
  const child = event.event === "candidate.startup-output" || event.event === "inspector.output";
  const origin = event.event.startsWith("inspector.")
    ? ("inspector" as const)
    : child
      ? ("application" as const)
      : ("relkit" as const);
  const raw = typeof event.fields?.output === "string" ? stripAnsi(event.fields.output) : "";
  // The record separator identifies presentation copies even when a large record is truncated.
  const presentation = child && origin === "application" && raw.startsWith("\u001e");
  const output = presentation ? raw.slice(1) : raw;
  if (presentation) {
    const forwarded = parseRuntimeLog(output);
    if (forwarded) return { record: forwarded, origin, forwarded: true };
  }
  let level = event.level;
  let transient = false;
  if ((event.event.startsWith("candidate.") && !child) || event.event.startsWith("supervisor."))
    level =
      event.event === "supervisor.outcome" &&
      event.fields?.phase === "drain" &&
      String(event.fields.state).endsWith("failed")
        ? "warn"
        : "debug";
  if (origin === "inspector" && child) {
    const status = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+(\d{3})\b/.exec(
      output.trim(),
    );
    if (status) {
      if (Number(status[1]) >= 500) level = "error";
      else {
        level = "debug";
        transient = true;
      }
    } else if (
      /^(?:▲ Next\.js\b|[✓✔]\s+(?:Ready in\b|Running next\.config\b)|[-–]\s+(?:Local|Network):|\$ next (?:dev|start)\b)/.test(
        output.trim(),
      )
    ) {
      level = "debug";
      transient = true;
    }
  }
  const fields = { ...event.fields };
  delete fields.output;
  const record: LogRecord = {
    version: 2,
    signal: "log",
    timestamp: new Date().toISOString(),
    level,
    component: child ? (origin === "application" ? "app" : "inspector") : "cli.dev",
    message: child ? output : event.event,
    fields,
  };
  return { record, origin, forwarded: presentation, transient };
}

function parseRuntimeLog(output: string): LogRecord | undefined {
  try {
    const value = JSON.parse(output) as Partial<LogRecord>;
    if (
      value === null ||
      value.version !== 2 ||
      value.signal !== "log" ||
      typeof value.timestamp !== "string" ||
      typeof value.component !== "string" ||
      typeof value.message !== "string" ||
      !levels.has(value.level as LogLevel) ||
      value.fields === null ||
      typeof value.fields !== "object" ||
      Array.isArray(value.fields)
    )
      return;
    for (const key of ["requestId", "traceId", "spanId", "functionId", "serviceId"] as const)
      if (value[key] !== undefined && typeof value[key] !== "string") return;
    return value as LogRecord;
  } catch {
    return undefined;
  }
}

function stripAnsi(value: string): string {
  return value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}
