import type { InvocationFailure } from "@relkit/invocation";
import { toPublicEnvelope } from "@relkit/invocation";
import type {
  InvocationCompletion,
  InvocationOutcome,
  InvocationRecord,
  InvocationValidationError,
  InvokeOptions,
} from "./invoke-types.js";
import { callHook, completeRecord } from "./invoke-utils.js";
import {
  emitObservabilityEvent,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./observability.js";

/** Publish terminal hooks and release admission even when hook work fails.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns A Promise completing after terminal hooks, admission release and signal unlinking.
 * @param args - Execution metadata and resources whose ownership is retained by this operation.
 */
export async function completeInvocation<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(args: {
  readonly record: InvocationRecord;
  readonly outcome: InvocationOutcome;
  readonly error: InvocationValidationError | InvocationFailure | undefined;
  readonly options: InvokeOptions<Input, Output, Context>;
  readonly lease: { readonly release: () => unknown } | undefined;
  readonly admitted: boolean;
  readonly unlink: () => void;
}): Promise<void> {
  const completed = completeRecord(args.record, args.outcome, args.options.now?.() ?? Date.now());
  const completion: InvocationCompletion = Object.freeze({
    record: completed,
    outcome: args.outcome,
    ...(args.error === undefined
      ? {}
      : { error: args.error, publicError: toPublicEnvelope(args.error) }),
  });
  try {
    await callHook(args.options.hooks?.onCompletion, completion);
    await emitObservabilityEvent(args.options.hooks?.observability, {
      protocol: OBSERVABILITY_HOOK_PROTOCOL,
      version: OBSERVABILITY_HOOK_VERSION,
      type: "invocation.completed",
      completion,
    });
  } finally {
    try {
      await args.lease?.release();
    } finally {
      await callHook(args.options.hooks?.onRelease, {
        record: completed,
        admitted: args.admitted,
      });
      await emitObservabilityEvent(args.options.hooks?.observability, {
        protocol: OBSERVABILITY_HOOK_PROTOCOL,
        version: OBSERVABILITY_HOOK_VERSION,
        type: "invocation.released",
        release: { record: completed, admitted: args.admitted },
      });
      args.unlink();
    }
  }
}
