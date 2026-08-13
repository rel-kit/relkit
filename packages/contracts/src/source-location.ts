/** A source file path normalized relative to a project root. */
export type ProjectRelativePath = string;

/** A portable source position used by diagnostics and graph metadata. */
export interface SourceLocation {
  readonly file: ProjectRelativePath;
  readonly line: number;
  readonly column: number;
}

/** Raised when a source path or position cannot be represented portably. */
export class SourceLocationError extends TypeError {
  constructor(reason: string) {
    super(`Invalid source location: ${reason}`);
    this.name = "SourceLocationError";
  }
}

type ParsedPath = {
  readonly absolute: boolean;
  readonly caseInsensitive: boolean;
  readonly rootKey: string;
  readonly segments: readonly string[];
};

/**
 * Returns a project-relative path with `/` separators.
 * Absolute inputs require an absolute project root and must remain inside it.
 */
export function normalizeSourcePath(filePath: string, projectRoot?: string): ProjectRelativePath {
  if (typeof filePath !== "string") {
    throw new SourceLocationError("file must be a string");
  }

  const file = parsePath(filePath, "file");
  if (projectRoot === undefined) {
    if (file.absolute) {
      throw new SourceLocationError("an absolute file requires an absolute project root");
    }
    return joinSegments(file.segments);
  }

  if (typeof projectRoot !== "string") {
    throw new SourceLocationError("project root must be a string");
  }
  const root = parsePath(projectRoot, "project root");
  if (!root.absolute) {
    throw new SourceLocationError("project root must be absolute");
  }

  if (!file.absolute) return joinSegments(file.segments);
  if (file.caseInsensitive !== root.caseInsensitive || !isWithin(file, root)) {
    throw new SourceLocationError("file must be inside the project root");
  }

  const relative = file.segments.slice(root.segments.length);
  return joinSegments(relative);
}

export const toProjectRelativePath = normalizeSourcePath;

/** Creates a portable source location from a path and one-based coordinates. */
export function createSourceLocation(
  filePath: string,
  line: number,
  column: number,
  projectRoot?: string,
): SourceLocation {
  const file = normalizeSourcePath(filePath, projectRoot);
  if (!Number.isInteger(line) || line < 1) {
    throw new SourceLocationError("line must be a positive integer");
  }
  if (!Number.isInteger(column) || column < 1) {
    throw new SourceLocationError("column must be a positive integer");
  }
  return { file, line, column };
}

/** Normalizes a source-location record without changing its identity fields. */
export function normalizeSourceLocation(
  location: SourceLocation,
  projectRoot?: string,
): SourceLocation {
  return createSourceLocation(location.file, location.line, location.column, projectRoot);
}

function parsePath(value: string, label: string): ParsedPath {
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
    if (segment.includes(":")) {
      throw new SourceLocationError(`${label} contains an invalid ':' segment`);
    }
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
}

function isWithin(file: ParsedPath, root: ParsedPath): boolean {
  if (file.rootKey !== root.rootKey || file.segments.length <= root.segments.length) return false;
  return root.segments.every((segment, index) =>
    file.caseInsensitive
      ? segment.toLowerCase() === file.segments[index]?.toLowerCase()
      : segment === file.segments[index],
  );
}

function joinSegments(segments: readonly string[]): string {
  if (segments.length === 0) {
    throw new SourceLocationError("file must be below the project root");
  }
  return segments.join("/");
}
