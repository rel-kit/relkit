import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { isWithinEffect, joinSegmentsEffect, parsePathEffect } from "./source-path.js";
import type { ProjectRelativePath, SourceLocation } from "./source-location.types.js";

export type { ProjectRelativePath, SourceLocation } from "./source-location.types.js";

/**
 * Tagged failure when a path or position cannot be represented portably.
 * The `reason` field preserves the invalid path or coordinate rule.
 * @example Effect.catchTag("SourceLocationError", (error) => Effect.logWarning(error.reason));
 */
// TODO(better-pkg): Use Data.TaggedError after TypeError-based callers migrate.
// Audit TypeError guards in packages/runtime-hono/src/agent-rpc-errors.ts,
// agent-protocol-support.ts, agent-inspector.ts, packages/cli/src/commands/dev-telemetry.ts,
// and packages/client/src/jobs/reconcile.ts before removing this compatibility.
export class SourceLocationError extends TypeError {
  readonly _tag = "SourceLocationError" as const;
  constructor(readonly reason: string) {
    super(`Invalid source location: ${reason}`);
    this.name = "SourceLocationError";
  }
}

/**
 * Normalizes a file path relative to a project root with `/` separators.
 * @param filePath - Relative path, or absolute path inside projectRoot.
 * @param projectRoot - Required absolute root for an absolute file path.
 * @returns An Effect containing the portable path, or SourceLocationError.
 * @example Effect.runSync(normalizeSourcePathEffect("src/app.ts"));
 */
export function normalizeSourcePathEffect(
  filePath: string,
  projectRoot?: string,
): Effect.Effect<ProjectRelativePath, SourceLocationError> {
  return observeContract(
    "source-location.normalize-path",
    Effect.gen(function* () {
      if (typeof filePath !== "string") {
        return yield* Effect.fail(new SourceLocationError("file must be a string"));
      }
      const file = yield* parsePathEffect(filePath, "file");
      if (projectRoot === undefined) {
        if (file.absolute) {
          return yield* Effect.fail(
            new SourceLocationError("an absolute file requires an absolute project root"),
          );
        }
        return yield* joinSegmentsEffect(file.segments);
      }
      if (typeof projectRoot !== "string") {
        return yield* Effect.fail(new SourceLocationError("project root must be a string"));
      }
      const root = yield* parsePathEffect(projectRoot, "project root");
      if (!root.absolute)
        return yield* Effect.fail(new SourceLocationError("project root must be absolute"));
      if (!file.absolute) return yield* joinSegmentsEffect(file.segments);
      if (file.caseInsensitive !== root.caseInsensitive || !(yield* isWithinEffect(file, root))) {
        return yield* Effect.fail(new SourceLocationError("file must be inside the project root"));
      }
      return yield* joinSegmentsEffect(file.segments.slice(root.segments.length));
    }),
  );
}

/**
 * Synchronous compatibility adapter for source path normalization.
 * @param filePath - Relative path, or absolute path inside projectRoot.
 * @param projectRoot - Required absolute root for an absolute file path.
 * @returns The portable project-relative path.
 * @throws SourceLocationError for invalid paths or paths outside the root.
 * @example normalizeSourcePath("src/app.ts");
 */
export function normalizeSourcePath(filePath: string, projectRoot?: string): ProjectRelativePath {
  return runContract(normalizeSourcePathEffect(filePath, projectRoot));
}

export const toProjectRelativePath = normalizeSourcePath;

/**
 * Creates a portable source location from a path and one-based coordinates.
 * @param filePath - Source file path.
 * @param line - One-based line number.
 * @param column - One-based column number.
 * @param projectRoot - Optional absolute project root.
 * @returns An Effect containing SourceLocation, or SourceLocationError.
 * @example Effect.runSync(createSourceLocationEffect("src/app.ts", 1, 1));
 */
export function createSourceLocationEffect(
  filePath: string,
  line: number,
  column: number,
  projectRoot?: string,
): Effect.Effect<SourceLocation, SourceLocationError> {
  return observeContract(
    "source-location.create",
    Effect.gen(function* () {
      const file = yield* normalizeSourcePathEffect(filePath, projectRoot);
      if (!Number.isInteger(line) || line < 1) {
        return yield* Effect.fail(new SourceLocationError("line must be a positive integer"));
      }
      if (!Number.isInteger(column) || column < 1) {
        return yield* Effect.fail(new SourceLocationError("column must be a positive integer"));
      }
      return { file, line, column };
    }),
  );
}

/**
 * Synchronous compatibility factory for a portable source location.
 * @param filePath - Source file path.
 * @param line - One-based line number.
 * @param column - One-based column number.
 * @param projectRoot - Optional absolute project root.
 * @returns The portable source location.
 * @throws SourceLocationError for invalid coordinates or path.
 * @example createSourceLocation("src/app.ts", 1, 1);
 */
export function createSourceLocation(
  filePath: string,
  line: number,
  column: number,
  projectRoot?: string,
): SourceLocation {
  return runContract(createSourceLocationEffect(filePath, line, column, projectRoot));
}

/**
 * Normalizes an existing source-location record.
 * @param location - Source location to normalize.
 * @param projectRoot - Optional absolute project root.
 * @returns An Effect containing the normalized record, or SourceLocationError.
 * @example Effect.runSync(normalizeSourceLocationEffect({ file: "src/app.ts", line: 1, column: 1 }));
 */
export function normalizeSourceLocationEffect(
  location: SourceLocation,
  projectRoot?: string,
): Effect.Effect<SourceLocation, SourceLocationError> {
  return observeContract(
    "source-location.normalize",
    createSourceLocationEffect(location.file, location.line, location.column, projectRoot),
  );
}

/**
 * Synchronous compatibility adapter for source-location records.
 * @param location - Source location to normalize.
 * @param projectRoot - Optional absolute project root.
 * @returns The normalized record.
 * @throws SourceLocationError for invalid coordinates or path.
 * @example normalizeSourceLocation({ file: "src/app.ts", line: 1, column: 1 });
 */
export function normalizeSourceLocation(
  location: SourceLocation,
  projectRoot?: string,
): SourceLocation {
  return runContract(normalizeSourceLocationEffect(location, projectRoot));
}
