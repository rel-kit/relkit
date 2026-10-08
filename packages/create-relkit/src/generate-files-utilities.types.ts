/** Existing staging cleanup result; secondary rejection evidence remains nonenumerable. */
export interface StageCleanupResult {
  readonly temporaryPath?: string;
  readonly removed: boolean;
}
