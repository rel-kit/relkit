import type { LogRecord } from "relkit/runtime-effect";
import { devLogDetails } from "./dev-log-details.js";
import { reloadLogLine } from "./dev-log-reload-format.js";
import type { DevLogFormatOptions } from "./dev-log-format.types.js";
export type { DevLogFormatOptions } from "./dev-log-format.types.js";

/**
 * Renders one admitted log using the existing compact terminal vocabulary.
 * @param record - Validated and redacted log envelope.
 * @param options - Width, color and detail policy.
 * @returns A formatted line, empty for intentionally hidden blank inspector output.
 */
export function formatDevLog(record: LogRecord, options: DevLogFormatOptions = {}): string {
  const f = record.fields;
  const event = record.message;
  if (record.component === "inspector" && event.trim() === "") return "";
  let scope = record.component.replace(/^runtime\./, "");
  let message = event;
  let details: string[] = [];
  const milliseconds = Number(f.durationMs);
  const duration = Number.isFinite(milliseconds) ? ` in ${Math.round(milliseconds)}ms` : "";
  const reload = scope === "cli.dev" ? reloadLogLine(event, f, duration) : undefined;
  if (reload !== undefined) ({ scope, message, details } = reload);
  else if (scope === "cli.dev") {
    scope =
      event.startsWith("dev.build") || event.startsWith("dev.generation") ? "build" : "relkit";
    if (event === "dev.starting") message = "Starting development server";
    else if (event === "dev.build.started") {
      message = f.initial ? "Compiling application" : "Rebuilding application";
      if (Array.isArray(f.files) && f.files.length) {
        if (options.verbose) details = [f.files.join(", ")];
        else message += ` (${f.files.length} changed ${f.files.length === 1 ? "file" : "files"})`;
      }
    } else if (event === "dev.generation.active")
      message = `${f.initial ? "Compiled" : "Reloaded"}${duration}`;
    else if (event === "dev.generation.failed") {
      message = f.previousActive
        ? "Reload failed; previous version is still serving"
        : "Application failed to start";
      const diagnosticLines = String(f.message ?? "")
        .split("\n")
        .filter((line) => /\b(?:error|warning) (?:RELKIT_[A-Z_]+|TS\d+):/.test(line));
      details =
        diagnosticLines.length > 0 && !options.verbose
          ? diagnosticLines
          : [
              options.verbose
                ? String(f.message ?? "Unknown error")
                : String(f.message ?? "Unknown error").split("\n")[0]!,
            ];
      if (!options.verbose && (f.error || String(f.message).includes("\n")))
        details.push("Use --verbose for diagnostic details.");
    } else if (event === "dev.ready") {
      scope = "server";
      message = "Ready";
      details = [
        ["API", f.backend],
        ["Inspector", f.inspector],
        ["Reference", f.apiReference],
        ["OpenAPI", f.openapi],
      ]
        .filter(([, value]) => value !== undefined)
        .map(([label, value]) => `${String(label).padEnd(10)} ${value}`);
    } else if (event === "dev.shutdown.started") message = "Stopping development server";
    else if (event === "dev.stopped") message = "Development server stopped";
    else if (event === "dev.local-services.cleanup-failed") {
      message = "Local service cleanup failed";
      details = [String(f.message)];
    } else if (event === "dev.inspector.stopped") message = "Inspector bridge stopped";
    else if (event === "dev.storage.failed") {
      message = "Telemetry storage unavailable; restart dev to recover";
      details = [String(f.message)];
    } else if (event === "dev.storage.imported") {
      message = `Imported ${f.records} historical records`;
      details = Number(f.malformed) ? [`${f.malformed} malformed records skipped`] : [];
    }
  }
  if (record.component === "runtime.http" && typeof f.method === "string") {
    scope = "http";
    message = `${f.method} ${f.path} → ${f.status ?? "cancelled"}${duration}`;
  }
  // A recorded exception's message is the line itself; its stack shows only with --verbose.
  const fields = typeof f["exception.type"] === "string" ? exceptionFields(f, options) : f;
  if (fields !== f && options.verbose && typeof f["exception.stacktrace"] === "string")
    details.push(...stackFrames(f["exception.stacktrace"]));
  details.push(...devLogDetails({ ...record, fields }, options.verbose === true));
  if (
    options.verbose &&
    message === event &&
    record.component !== "inspector" &&
    typeof f.message !== "string"
  )
    details.push(JSON.stringify({ ...fields, ...correlations(record) }));
  const width = Math.max(40, options.columns ?? 100);
  const scopeWidth = width < 80 ? 10 : 16;
  const time = timestamp(record.timestamp);
  const level = record.level.toUpperCase().padEnd(5);
  // A long scope widens its own line rather than losing the middle of its name.
  const label = scope.padEnd(scopeWidth);
  const prefix = `${time} ${color(level, record.level, options.color)} ${label}  `;
  const indent = " ".repeat(time.length + 1 + 5 + 1 + label.length + 2);
  const [first = "", ...continuation] = message.split("\n");
  const contentWidth = Math.max(1, width - indent.length);
  const body = [...continuation, ...details].flatMap((detail) => detail.split("\n"));
  // The request line stays whole so its status and duration never land on a second line.
  const requestLine = scope === "http";
  const lines = [first, ...body].flatMap((line, index) => {
    if (event === "dev.ready" || options.verbose || (requestLine && index === 0)) return [line];
    return wrap(line, contentWidth);
  });
  return (
    `${prefix}${lines[0] ?? ""}` +
    lines
      .slice(1)
      .map((line) => `\n${indent}${line}`)
      .join("")
  );
}

/** Wraps terminal diagnostics to the available width without discarding words.
 * @param value - Terminal content.
 * @param width - Available columns.
 * @returns Wrapped words without truncating diagnostics.
 */
function wrap(value: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = "";
    }
    line += `${line ? " " : ""}${word}`;
  }
  return [...lines, line];
}

/** Keeps the fields of a recorded exception that its line does not already show.
 * @param fields - Record fields with `exception.*` attributes.
 * @param options - Detail policy; without `verbose` no metadata is shown.
 * @returns The fields without the message and stack, or none outside verbose mode.
 */
function exceptionFields(
  fields: LogRecord["fields"],
  options: DevLogFormatOptions,
): LogRecord["fields"] {
  if (!options.verbose) return {};
  const {
    "exception.message": _message,
    "exception.stacktrace": _stack,
    ...rest
  } = fields as Record<string, LogRecord["fields"][string]>;
  return rest;
}

/** Selects the call frames of a stack, trimmed.
 * @param stack - Stack text whose first line repeats the message.
 * @returns The `at …` lines.
 */
function stackFrames(stack: string): string[] {
  return stack
    .split("\n")
    .filter((line) => /^\s*at /.test(line))
    .map((line) => line.trim());
}

/** Renders the nonempty correlation fields of a validated log envelope.
 * @param record - Admitted envelope.
 * @returns Existing nonempty correlation labels for verbose rendering.
 */
function correlations(record: LogRecord) {
  return Object.fromEntries(
    ["requestId", "traceId", "spanId", "functionId", "serviceId"].flatMap((key) => {
      const value = record[key as keyof LogRecord];
      return value ? [[key, value]] : [];
    }),
  );
}

/** Formats a native record timestamp for the existing terminal presentation.
 * @param value - Native record time.
 * @returns Local millisecond clock display, retaining an invalid original value.
 */
function timestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return (
    [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":") + `.${String(date.getMilliseconds()).padStart(3, "0")}`
  );
}

/** Applies the configured terminal severity color to a label.
 * @param value - Level label.
 * @param level - Existing severity.
 * @param enabled - Terminal color policy.
 * @returns Optional ANSI presentation for that label.
 */
function color(value: string, level: string, enabled = false): string {
  const code =
    level === "error" || level === "fatal"
      ? 31
      : level === "warn"
        ? 33
        : level === "debug" || level === "trace"
          ? 2
          : 0;
  return enabled && code ? `\x1b[${code}m${value}\x1b[0m` : value;
}
