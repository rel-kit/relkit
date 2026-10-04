/** One owner-relative import literal replacement in a generated snippet. */
export interface ExampleImportReplacement {
  /** Original literal's inclusive start offset. */
  readonly start: number;
  /** Original literal's exclusive end offset. */
  readonly end: number;
  /** JSON-quoted resolved module specifier. */
  readonly value: string;
}
