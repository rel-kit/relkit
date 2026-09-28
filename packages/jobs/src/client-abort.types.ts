/** Cancellation and deadline state owned by one client enqueue. */
export interface JobClientAbortRegistration {
  readonly stopped: Promise<Error>;
  readonly failure: () => Error | undefined;
  readonly dispose: () => void;
}
