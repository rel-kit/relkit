/** Physical completion receipt retained without changing the original Promise identity. */
/** Shutdown observes settlement only; track retains the original caller's typed result. */
export interface RuntimeCompletionReceipt {
  readonly then: (completed: () => void, failed: () => void) => PromiseLike<void>;
}
