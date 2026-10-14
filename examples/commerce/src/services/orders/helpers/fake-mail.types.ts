/** Describes process-local fake mail inputs and receipts used by the export tutorial, with no external delivery authority. */

/** Destination and subject retained for the first admission of each key. */
export interface FakeMailRecord {
  readonly to: string;
  readonly subject: string;
}

/** Tutorial mail intent whose key deduplicates within one loaded helper instance. */
export interface FakeMailInput extends FakeMailRecord {
  readonly idempotencyKey: string;
}

/** Observed process-local admission, retaining the caller's original key. */
export interface FakeMailReceipt {
  readonly accepted: boolean;
  readonly idempotencyKey: string;
}
