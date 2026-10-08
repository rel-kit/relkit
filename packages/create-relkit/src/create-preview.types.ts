/** Existing read-only creation preview result. */
export interface CreateScaffoldPlan {
  readonly destination: string;
  readonly files: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly profiles: readonly string[];
  readonly warnings: readonly string[];
}
