/** Finite request arguments and whether resolution needed interactive input. */
export interface AddResolutionSnapshot {
  readonly args: readonly string[];
  readonly prompted: boolean;
}
