import type { LogRecord } from "@relkit/runtime-effect";
import { devLogDetails } from "./dev-log-details.js";

export interface DevLogFormatOptions {
  readonly verbose?: boolean;
  readonly color?: boolean;
  readonly columns?: number;
}

export function formatDevLog(record: LogRecord, options: DevLogFormatOptions = {}): string {
  const f = record.fields;
  const event = record.message;
  let scope = record.component.replace(/^runtime\./, "");
  let message = event;
  let details: string[] = [];
  const milliseconds = Number(f.durationMs);
  const duration = Number.isFinite(milliseconds) ? ` in ${Math.round(milliseconds)}ms` : "";
  if (scope === "cli.dev") {
    scope =
      event.startsWith("dev.build") || event.startsWith("dev.generation") ? "build" : "relkit";
    if (event === "dev.starting") message = "Starting development server";
    else if (event === "dev.build.started") {
      message = f.initial ? "Compiling application" : "Rebuilding application";
      if (Array.isArray(f.files) && f.files.length) details = [f.files.join(", ")];
    } else if (event === "dev.generation.active")
      message = `${f.initial ? "Compiled" : "Reloaded"}${duration}`;
    else if (event === "dev.generation.failed") {
      message = f.previousActive
        ? "Reload failed; previous version is still serving"
        : "Application failed to start";
      details = [String(f.message ?? "Unknown error")];
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
    } else if (event === "dev.storage.failed") {
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
  details.push(...devLogDetails(record, options.verbose === true));
  if (options.verbose) details.push(JSON.stringify({ ...f, ...correlations(record) }));
  const width = Math.max(40, options.columns ?? 100);
  const scopeWidth = width < 80 ? 10 : 16;
  const time = timestamp(record.timestamp);
  const level = record.level.toUpperCase().padEnd(5);
  const prefix = `${time} ${color(level, record.level, options.color)} ${middle(scope, scopeWidth).padEnd(scopeWidth)}  `;
  const indent = " ".repeat(time.length + 1 + 5 + 1 + scopeWidth + 2);
  const [first = "", ...continuation] = message.split("\n");
  const contentWidth = Math.max(1, width - indent.length);
  const body = [...continuation, ...details].flatMap((detail) => detail.split("\n"));
  const lines = [first, ...body].flatMap((line) => {
    if (event === "dev.ready" || options.verbose) return [line];
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

function wrap(value: string, width: number): string[] {
  const characters = Array.from(value);
  const lines: string[] = [];
  for (let start = 0; start < characters.length; start += width)
    lines.push(characters.slice(start, start + width).join(""));
  return lines.length ? lines : [""];
}

function correlations(record: LogRecord) {
  return Object.fromEntries(
    ["requestId", "traceId", "spanId", "functionId", "serviceId"].flatMap((key) => {
      const value = record[key as keyof LogRecord];
      return value ? [[key, value]] : [];
    }),
  );
}

function timestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return (
    [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":") + `.${String(date.getMilliseconds()).padStart(3, "0")}`
  );
}

function middle(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  const side = Math.floor((maximum - 1) / 2);
  return `${value.slice(0, side)}…${value.slice(-(maximum - side - 1))}`;
}

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
