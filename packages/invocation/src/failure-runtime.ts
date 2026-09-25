import { Effect } from "effect";
import { FailureDetailError, rememberFailureEffect } from "./failure-internals.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { ErrorRetry, FailureKind, FailureOutcome, FailureTag } from "./failure.types.js";
import type { FailureSpec } from "./failure-runtime.types.js";

export type { FailureSpec } from "./failure-runtime.types.js";

/** Frozen runtime failure carrying private cause and stack metadata.
 * @example new RuntimeFailure(spec, cause);
 */
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
    runInvocationSync(initializeRuntimeFailureEffect(this, spec, cause));
  }
}

/** Constructs a frozen runtime failure through Effect.
 * @param spec - Public failure metadata.
 * @param cause - Internal failure cause.
 * @returns A RuntimeFailure; malformed inputs remain defects.
 * @example Effect.runSync(makeFailureEffect(spec, cause));
 */
export function makeFailureEffect(
  spec: FailureSpec,
  cause: unknown,
): Effect.Effect<RuntimeFailure> {
  return observeInvocation(
    "failure.create",
    Effect.sync(() => new RuntimeFailure(spec, cause)),
  );
}

/** Synchronous runtime failure construction adapter.
 * @param spec - Public failure metadata.
 * @param cause - Internal failure cause.
 * @returns A frozen RuntimeFailure.
 * @throws TypeError for invalid internal spec or detail target.
 * @example makeFailure(spec, cause);
 */
export function makeFailure(spec: FailureSpec, cause: unknown): RuntimeFailure {
  return runInvocationSync(makeFailureEffect(spec, cause));
}

function initializeRuntimeFailureEffect(
  target: RuntimeFailure,
  spec: FailureSpec,
  cause: unknown,
): Effect.Effect<void, FailureDetailError> {
  return observeInvocation(
    "failure.construct",
    Effect.gen(function* () {
      yield* Effect.sync(() => Object.assign(target, spec));
      yield* rememberFailureEffect(target, cause, undefined);
      yield* Effect.sync(() => Object.freeze(target));
    }),
  );
}
