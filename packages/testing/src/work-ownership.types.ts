/** Native completion receipts and admission state shared by one scoped harness. */
export interface WorkOwnershipState {
  readonly kind?: string;
  closed: boolean;
  controller: AbortController;
  pending: Set<Promise<unknown>>;
  restarting?: Promise<void>;
  closing?: Promise<void>;
}

/** Fixed release labels supplied only by the two declaration-owned durable harnesses. */
export type OwnedCloseOperation = "job.close" | "event.close";
