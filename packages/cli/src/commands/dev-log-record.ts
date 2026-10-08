import type { LogRecord } from "@relkit/runtime-effect";
import { Schema } from "effect";
import type { DevLogEvent } from "./dev.js";
import { runtimeLogSchema } from "./dev-log-record.schemas.js";

/**
 * Projects SDK events into the existing admitted-log presentation envelope.
 * @param event - Native event and bounded child output.
 * @returns Original forwarding/transient policy with ANSI-only presentation removed.
 */
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
  if (event.event === "dev.shutdown.requested") {
    level = "debug";
    transient = true;
  }
  if ((event.event.startsWith("candidate.") && !child) || event.event.startsWith("supervisor."))
    level =
      event.event === "supervisor.outcome" &&
      event.fields?.phase === "drain" &&
      String(event.fields.state).endsWith("failed")
        ? "warn"
        : "debug";
  if (origin === "inspector" && child) {
    const trimmed = output.trim();
    const status = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+(\d{3})\b/.exec(trimmed);
    if (trimmed === "") {
      level = "debug";
      transient = true;
    } else if (status) {
      if (Number(status[1]) >= 500) level = "error";
      else {
        level = "debug";
        transient = true;
      }
    } else if (
      /^(?:▲ Next\.js\b|[✓✔]\s+(?:Ready in\b|Running next\.config\b)|[-–]\s+(?:Local|Network):|\$ next (?:dev|start)\b)/.test(
        trimmed,
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

/**
 * Validates a child presentation copy without projecting away live envelope metadata.
 * @param output - One bounded child JSON log line.
 * @returns The original complete log envelope, absent for malformed output.
 */
function parseRuntimeLog(output: string): LogRecord | undefined {
  try {
    const value: unknown = JSON.parse(output);
    return Schema.is(runtimeLogSchema)(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Removes native terminal styling before admitting structured child output.
 * @param value - Child terminal output.
 * @returns Content with native ANSI presentation removed before JSON admission.
 */
function stripAnsi(value: string): string {
  return value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}
