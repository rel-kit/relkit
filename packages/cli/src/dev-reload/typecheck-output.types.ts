/** Parsed shapes of type-checker watch output. */

/** One type error or warning with its source location. */
export interface TypecheckDiagnostic {
  /** Project-relative file. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** Compiler code such as `TS2322`. */
  readonly code: string;
  readonly message: string;
}

/** Classification of one output line. */
export type TypecheckLine =
  | { readonly kind: "diagnostic"; readonly diagnostic: TypecheckDiagnostic }
  | { readonly kind: "started" }
  | { readonly kind: "finished"; readonly errors: number }
  | { readonly kind: "other" };
