/**
 * Terminal wording for the development loop's reload and type-check events. The dev log
 * formatter asks this module first for `cli.dev` events; it returns undefined for every
 * other event. Pure.
 */
import type { LogRecord } from "relkit/runtime-effect";

/** Rendered scope, message and detail lines of one event. */
interface ReloadLine {
  readonly scope: string;
  readonly message: string;
  readonly details: string[];
}

/**
 * Formats a reload or type-check event.
 * @param event - Event name.
 * @param fields - Event fields.
 * @param duration - Pre-rendered ` in Nms` suffix, or empty.
 * @returns The line, or undefined for other events.
 */
export function reloadLogLine(
  event: string,
  fields: LogRecord["fields"],
  duration: string,
): ReloadLine | undefined {
  if (event === "dev.generation.swapped")
    return { scope: "build", message: `Reloaded${duration} (same process)`, details: [] };
  if (event === "dev.typecheck.passed")
    return { scope: "types", message: "No type errors", details: [] };
  if (event === "dev.typecheck.unavailable")
    return {
      scope: "types",
      message: "Type-checking unavailable: no tsconfig.json or TypeScript",
      details: [],
    };
  if (event !== "dev.typecheck.failed") return undefined;
  const diagnostics = Array.isArray(fields.diagnostics) ? fields.diagnostics : [];
  const errors = Number(fields.errors);
  return {
    scope: "types",
    message: `${errors} type ${errors === 1 ? "error" : "errors"}; reloads continue`,
    details: diagnostics.map((entry) => {
      const value = entry as {
        file?: string;
        line?: number;
        column?: number;
        code?: string;
        message?: string;
      };
      return `${value.file}:${value.line}:${value.column} error ${value.code}: ${value.message}`;
    }),
  };
}
