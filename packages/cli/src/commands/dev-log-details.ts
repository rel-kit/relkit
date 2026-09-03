import type { LogRecord } from "@relkit/runtime-effect";

export function devLogDetails(record: LogRecord, verbose: boolean): string[] {
  const lines: string[] = [];
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 6 || value === null || typeof value !== "object") return;
    const error = value as Record<string, unknown>;
    if (typeof error.message === "string")
      lines.push(
        `${depth ? "└─ " : ""}${error.name ?? "Error"}${error.code ? ` [${error.code}]` : ""}: ${error.message}`,
      );
    if (typeof error.stack === "string") {
      const frames = error.stack.split("\n").filter((line) => /^\s*at /.test(line));
      const visible = frames.filter(
        (line) => !/node_modules|node:|bun:|\.relkit\/(build|generated)/.test(line),
      );
      lines.push(...(verbose ? frames : visible.slice(0, 3)).map((line) => line.trim()));
      if (!verbose && frames.length > Math.min(visible.length, 3))
        lines.push("Internal stack hidden · use --verbose");
    }
    visit(error.cause, depth + 1);
    if (Array.isArray(error.reasons))
      for (const reason of error.reasons) visit(reason?.detail, depth);
  };
  visit(record.fields.error ?? record.fields.cause);
  if (!verbose && !["cli.dev", "app", "inspector", "runtime.http"].includes(record.component)) {
    const metadata = Object.fromEntries(
      Object.entries(record.fields).filter(([key]) => !["error", "cause"].includes(key)),
    );
    if (Object.keys(metadata).length) lines.push(JSON.stringify(metadata));
  }
  if (record.level === "error" || record.level === "warn" || verbose) {
    if (record.requestId) lines.push(`request: ${record.requestId}`);
    if (record.traceId) lines.push(`trace: ${record.traceId}`);
  }
  return lines;
}
