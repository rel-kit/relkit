/** Native terminal exit and captured display output for packed acceptance assertions. */
export interface ScaffoldTerminalResult {
  /** Actual packed child exit status, including cancellation 130. */
  readonly code: number;
  /** Bounded native terminal display, retained for acceptance assertions. */
  readonly output: string;
}

/** Authority for one native terminal invocation; prompt input never persists beyond its child scope. */
export interface ScaffoldTerminalRequest {
  /** Installed executable followed by its exact argument vector. */
  readonly command: readonly string[];
  /** Caller-owned standalone application directory. */
  readonly cwd: string;
  /** Expected prompt fragments and literal terminal input in display order. */
  readonly answers: readonly (readonly [string, string])[];
  /** Child-only environment overrides, including deliberate Docker unavailability. */
  readonly env: Readonly<Record<string, string>>;
}

/** Mutable display state belongs exclusively to one terminal registration and its native callback. */
export interface ScaffoldTerminalDisplay {
  /** Bounded accumulated native display bytes decoded as text. */
  output: string;
  /** Number of ordered answers physically sent to this terminal. */
  answered: number;
  /** Native display-bound failure, surfaced after the child settles. */
  overflow: Error | undefined;
}
