import type { InvocationFailure } from "./failure.js";
import { toPublicEnvelope } from "./failure.js";
import { callHook } from "./validation.js";
import type { InvocationRecord, InvocationValidationError } from "./contracts.js";
import type { InvocationDispatchOptions } from "./dispatcher-types.js";
import { completeStandaloneRecord } from "./standalone-utils.js";

type Outcome = Exclude<InvocationRecord["status"], "started">;

export function createStandaloneFinisher<Context extends { readonly signal: AbortSignal }>(args: {
  readonly record: InvocationRecord;
  readonly options: InvocationDispatchOptions<Context>;
  readonly now: () => number;
  readonly settleProgress: (() => void) | undefined;
  readonly unlink: () => void;
}): (
  outcome: Outcome,
  error: InvocationValidationError | InvocationFailure | undefined,
) => Promise<void> {
  let completed = false;
  return async (outcome, error) => {
    if (completed) return;
    completed = true;
    args.settleProgress?.();
    const record = completeStandaloneRecord(args.record, outcome, args.now());
    await callHook(args.options.onCompletion, {
      record,
      outcome,
      ...(error === undefined ? {} : { error, publicError: toPublicEnvelope(error) }),
    });
    await callHook(args.options.onRelease, { record, admitted: false });
    args.unlink();
  };
}
