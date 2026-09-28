import type { DurationInput } from "./duration.js";
import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
/** Signal and per-read timeout for native run observation. */
export interface JobObserveOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: DurationInput;
}
/** Native control response with an uncertain outcome. */
export interface UnknownControlOutcome {
  readonly operationId: string;
  readonly idempotencyKey?: string;
  readonly outcome: "unknown";
  readonly recovery?: JobUnknownOutcome["recovery"];
}
