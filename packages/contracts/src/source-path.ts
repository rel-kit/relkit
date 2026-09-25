import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { SourceLocationError } from "./source-location.js";
import type { ParsedPath } from "./source-location.types.js";

/**
 * Parses a platform path into portable root and segment components.
 * @param value - Path to parse.
 * @param label - Name used in error messages.
 * @returns An Effect containing normalized components or SourceLocationError.
 * @example Effect.runSync(parsePathEffect("src/app.ts", "file"));
 */
export function parsePathEffect(
  value: string,
  label: string,
): Effect.Effect<ParsedPath, SourceLocationError> {
  return observeContract(
    "source-path.parse",
    Effect.try({
      try: () => {
        if (value.length === 0 || value.includes("\0")) {
          throw new SourceLocationError(`${label} must be a non-empty path`);
        }
        const slashPath = value.replaceAll("\\", "/");
        const drive = /^([A-Za-z]):(?:\/|$)/.exec(slashPath);
        const isUnc = slashPath.startsWith("//");
        const absolute = Boolean(drive) || isUnc || slashPath.startsWith("/");
        const caseInsensitive = Boolean(drive) || isUnc;
        const rootKey = drive ? `${drive[1]?.toLowerCase()}:` : isUnc ? "unc" : absolute ? "/" : "";
        const body = drive
          ? slashPath.slice(2)
          : isUnc
            ? slashPath.slice(2)
            : absolute
              ? slashPath.slice(1)
              : slashPath;
        const segments: string[] = [];
        for (const segment of body.split("/")) {
          if (segment === "" || segment === ".") continue;
          if (segment.includes(":"))
            throw new SourceLocationError(`${label} contains an invalid ':' segment`);
          if (segment === "..") {
            if (segments.length === 0) {
              if (absolute) continue;
              throw new SourceLocationError(`${label} cannot escape its root`);
            }
            segments.pop();
            continue;
          }
          segments.push(segment);
        }
        return { absolute, caseInsensitive, rootKey, segments };
      },
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        error instanceof SourceLocationError ? Effect.fail(error) : Effect.die(error),
      ),
    ),
  );
}

/**
 * Synchronous compatibility parser for platform paths.
 * @param value - Path to parse.
 * @param label - Name used in error messages.
 * @returns Normalized components.
 * @throws SourceLocationError for empty or escaping paths.
 * @example parsePath("src/app.ts", "file");
 */
export function parsePath(value: string, label: string): ParsedPath {
  return runContract(parsePathEffect(value, label));
}

/**
 * Checks whether an absolute file is below an absolute project root.
 * @param file - Parsed file path.
 * @param root - Parsed absolute project root.
 * @returns An Effect containing whether the file lies strictly below the root.
 * @example Effect.runSync(isWithinEffect(parsePath("/app/src/app.ts", "file"), parsePath("/app", "root")));
 */
export function isWithinEffect(file: ParsedPath, root: ParsedPath): Effect.Effect<boolean> {
  return observeContract(
    "source-path.within",
    Effect.sync(() => {
      if (file.rootKey !== root.rootKey || file.segments.length <= root.segments.length)
        return false;
      return root.segments.every((segment, index) =>
        file.caseInsensitive
          ? segment.toLowerCase() === file.segments[index]?.toLowerCase()
          : segment === file.segments[index],
      );
    }),
  );
}

/**
 * Synchronous compatibility check for path containment.
 * @param file - Parsed file path.
 * @param root - Parsed absolute project root.
 * @returns Whether the file lies strictly below the root.
 * @example isWithin(parsePath("/app/src/app.ts", "file"), parsePath("/app", "root"));
 */
export function isWithin(file: ParsedPath, root: ParsedPath): boolean {
  return runContract(isWithinEffect(file, root));
}

/**
 * Joins normalized path components, rejecting a root-only file.
 * @param segments - Path segments to join.
 * @returns An Effect containing a portable path or SourceLocationError.
 * @example Effect.runSync(joinSegmentsEffect(["src", "app.ts"]));
 */
export function joinSegmentsEffect(
  segments: readonly string[],
): Effect.Effect<string, SourceLocationError> {
  return observeContract(
    "source-path.join",
    Effect.try({
      try: () => {
        if (segments.length === 0)
          throw new SourceLocationError("file must be below the project root");
        return segments.join("/");
      },
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        error instanceof SourceLocationError ? Effect.fail(error) : Effect.die(error),
      ),
    ),
  );
}

/**
 * Synchronous compatibility joiner for normalized path components.
 * @param segments - Path segments to join.
 * @returns Portable path separated by `/`.
 * @throws SourceLocationError for a root-only path.
 * @example joinSegments(["src", "app.ts"]);
 */
export function joinSegments(segments: readonly string[]): string {
  return runContract(joinSegmentsEffect(segments));
}
