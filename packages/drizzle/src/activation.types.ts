/** Acquisition policy for an application that owns its database lifetime. */
export interface DrizzleActivationOptions {
  /** Bypasses descriptor sharing; the caller must close this activation. */
  readonly isolated?: boolean;
}
