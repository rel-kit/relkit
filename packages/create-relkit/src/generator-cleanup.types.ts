/** Secondary resource-release evidence, separated from the authoritative public failure. */
export interface GeneratorCleanupFailure {
  readonly operation: "temporary-file" | "rollback" | "marker" | "stage" | "process";
  readonly cause: unknown;
}
