/** Defines source-addressed diagnostics shared by the ownership scan and its CLI report; these values grant no import authority. */
export interface Violation {
  /** Repository-relative importing source or manifest. */
  readonly file: string;
  /** One-based source line for the rejected edge. */
  readonly line: number;
  /** One-based source column for the rejected edge. */
  readonly column: number;
  /** Existing rule identifier consumed by native guardrail assertions. */
  readonly rule: string;
  /** Actionable package/ownership description. */
  readonly message: string;
}
