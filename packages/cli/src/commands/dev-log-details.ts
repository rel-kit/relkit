import type { LogRecord } from "@relkit/runtime-effect";

export function devLogDetails(record: LogRecord, verbose: boolean): string[] {
  const lines: string[] = [];
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 6 || value === null || typeof value !== "object") return;
    const error = value as Record<string, unknown>;
    const code = error.code ?? (depth === 0 ? record.fields.code : undefined);
    if (typeof error.message === "string" && record.fields.message !== error.message)
      lines.push(
        `${depth ? "└─ " : ""}${error.name ?? "Error"}${code ? ` [${code}]` : ""}: ${error.message}`,
      );
    if (
      typeof error.stack === "string" &&
      code !== "RELKIT_LOCAL_LEASE_HELD" &&
      (verbose ||
        !["cli.dev", "runtime.provider", "runtime.database", "runtime.auth"].includes(
          record.component,
        ))
    ) {
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
      Object.entries(record.fields).filter(
        ([key]) =>
          !["error", "cause", ...(record.fields.error ? ["code", "detail"] : [])].includes(key),
      ),
    );
    if (Object.keys(metadata).length) lines.push(JSON.stringify(metadata));
  }
  if (record.level === "error" || record.level === "warn" || verbose) {
    if (record.requestId) lines.push(`request: ${record.requestId}`);
    if (record.traceId) lines.push(`trace: ${record.traceId}`);
  }
  return lines;
}
