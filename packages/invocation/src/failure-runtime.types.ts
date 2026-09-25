import type { ErrorRetry, FailureBase } from "./failure.types.js";

/** Internal immutable specification for a runtime failure.
 * The factory freezes the resulting failure and stores private detail separately.
 * @example const failure = makeFailure(spec, cause);
 */
export interface FailureSpec extends FailureBase {
  readonly id?: string;
  readonly data?: unknown;
  readonly retry?: ErrorRetry;
  readonly afterMs?: number;
  readonly status?: number;
  readonly capability?: string;
  readonly profile?: string;
  readonly operation?: string;
}
