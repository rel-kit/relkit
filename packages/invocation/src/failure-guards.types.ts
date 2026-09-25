import type { ErrorRetryInput } from "./error-retry.types.js";

/** Structural shape accepted from an authored declared error.
 * The error ID and reference must agree before normalization.
 * @example if (isDeclaredError(value)) console.log(value.id);
 */
export type DeclaredErrorLike = Error & {
  readonly id: string;
  readonly data: unknown;
  readonly retry?: ErrorRetryInput;
  readonly afterMs?: number;
  readonly http?: { readonly status: number };
  readonly ref: { readonly kind: unknown; readonly id: string };
};

/** Wrapper emitted by function invocation boundaries.
 * Its error field is normalized before crossing the public boundary.
 * @example if (isFunctionFailure(value)) return value.error;
 */
export type FunctionFailureLike = {
  readonly _tag: "FunctionFailure";
  readonly error: unknown;
};
