/** Exact source positions and stable rule identities returned by the scope scanner. */
export type ScopeViolation = {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
};
