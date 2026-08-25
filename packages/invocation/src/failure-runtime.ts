import { rememberFailure } from "./failure-internals.js";
import type {
  ErrorRetry,
  FailureBase,
  FailureKind,
  FailureOutcome,
  FailureTag,
} from "./failure-types.js";

interface FailureSpec extends FailureBase {
  readonly id?: string;
  readonly data?: unknown;
  readonly retry?: ErrorRetry;
  readonly afterMs?: number;
  readonly status?: number;
  readonly capability?: string;
  readonly profile?: string;
  readonly operation?: string;
}

export class RuntimeFailure {
  readonly message!: string;
  readonly _tag!: FailureTag;
  readonly kind!: FailureKind;
  readonly outcome!: FailureOutcome;
  readonly code!: string;
  readonly id?: string;
  readonly data?: unknown;
  readonly retry?: ErrorRetry;
  readonly afterMs?: number;
  readonly status?: number;
  readonly capability?: string;
  readonly profile?: string;
  readonly operation?: string;

  constructor(spec: FailureSpec, cause: unknown) {
    Object.assign(this, spec);
    rememberFailure(this, cause, undefined);
    Object.freeze(this);
  }
}

export function makeFailure(spec: FailureSpec, cause: unknown): RuntimeFailure {
  return new RuntimeFailure(spec, cause);
}
