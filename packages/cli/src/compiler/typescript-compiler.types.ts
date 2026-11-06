/** Results of running the application's TypeScript compiler as a separate process. */

/** One diagnostic printed by `tsc --pretty false` (or `tsgo`). */
export interface CompilerOutputDiagnostic {
  /** Compiler code such as `TS2322`. */
  readonly code: string;
  readonly severity: "error" | "warning" | "info";
  /** Message including its indented continuation lines. */
  readonly message: string;
  /** Location as printed, relative to the working directory, for located diagnostics. */
  readonly location?: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
  };
}

/** Outcome of one compiler run. */
export type CompilerRun =
  | { readonly kind: "checked"; readonly diagnostics: readonly CompilerOutputDiagnostic[] }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed"; readonly exitCode: number; readonly output: string };
