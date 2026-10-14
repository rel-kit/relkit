/** Precise native guardrail results and pure synthetic workspace declarations. */
export type Files = Readonly<Record<string, string>>;

/** Completed native commands retain nonzero exit codes for negative guardrail assertions. */
export interface CommandResult {
  /** Original native exit status after both output streams settle. */
  readonly exitCode: number;
  /** Complete bounded standard output. */
  readonly stdout: string;
  /** Complete bounded standard error. */
  readonly stderr: string;
}

/** One synthetic package whose public imports are checked by the actual boundary CLI. */
export interface PackageInput {
  /** Repository-relative synthetic package directory. */
  readonly path: string;
  /** Native package name recorded in its manifest. */
  readonly name: string;
  /** Exact TypeScript input; intentionally invalid examples remain plain strings. */
  readonly source: string;
  /** Explicit dependency declarations, including deliberate forbidden dependencies. */
  readonly dependencies?: Record<string, string>;
}

/** Original boundary case and the exact native diagnostic it must produce. */
export interface BoundaryCase {
  /** Original native test label. */
  readonly name: string;
  /** Exact synthetic manifest and source bytes. */
  readonly files: Files;
  /** Path, package owner and rule whose rejection must remain observable. */
  readonly expected: {
    /** Source or manifest rejected by the actual scanner. */
    readonly path: string;
    /** Original scanner ownership label. */
    readonly owner: string;
    /** Original boundary rule identifier. */
    readonly rule: string;
  };
}

/** Pure original scope inputs and exact path/rule diagnostic pairs. */
export interface ScopeScenario {
  /** Exact source bytes consumed by the native scope scanner. */
  readonly files: Files;
  /** Each original rejected source and its original rule. */
  readonly expected: readonly (readonly [path: string, rule: string])[];
}
