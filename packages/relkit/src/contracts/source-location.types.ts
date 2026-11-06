/** A source file path normalized relative to a project root. */
export type ProjectRelativePath = string;

/** A portable source position used by diagnostics and graph metadata. */
export interface SourceLocation {
  readonly file: ProjectRelativePath;
  readonly line: number;
  readonly column: number;
}

/** Components of a normalized source path; owned by the source-location parser. */
export type ParsedPath = {
  readonly absolute: boolean;
  readonly caseInsensitive: boolean;
  readonly rootKey: string;
  readonly segments: readonly string[];
};
