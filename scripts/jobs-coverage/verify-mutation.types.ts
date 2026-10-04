/** One Stryker mutant outcome and its original source position. */
export interface Mutant {
  readonly status: string;
  readonly location?: { readonly start?: { readonly line?: number } };
}

/** Complete file-indexed Stryker JSON output used by the semantic gate. */
export interface MutationReport {
  readonly files: Record<string, { readonly mutants: readonly Mutant[] }>;
}

/** Inclusive source range implementing a retained semantic responsibility. */
export interface MutationTarget {
  readonly file: string;
  readonly start: number;
  readonly end: number;
}
