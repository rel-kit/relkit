/** Acquisition policy for authentication bound to an independently owned database. */
export interface BetterAuthActivationOptions {
  /** Creates native auth without replacing the descriptor's shared handler target. */
  readonly isolated?: boolean;
}
