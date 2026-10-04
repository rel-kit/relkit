/** Transmitted job input and its operation/run receipt references. */
export interface PreparedJobRequest {
  readonly value: unknown;
  readonly operationId: string;
  readonly idempotencyKey?: string;
}
