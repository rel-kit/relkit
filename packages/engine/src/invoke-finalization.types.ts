import type { InvocationFailure } from "@relkit/invocation";
import type { InvocationExecution } from "./invoke-now-stream.types.js";
import type {
  InvocationOutcome,
  InvocationRecord,
  InvocationValidationError,
  InvokeOptions,
} from "./invoke-types.js";

/** Resources retained by execution until ordinary completion, suspension or stream transfer. */
export interface InvocationFinalization<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
> {
  readonly record: InvocationRecord;
  readonly outcome: InvocationOutcome;
  readonly error: InvocationValidationError | InvocationFailure | undefined;
  readonly options: InvokeOptions<Input, Output, Context>;
  readonly lease: { readonly release: () => unknown } | undefined;
  readonly admitted: boolean;
  readonly unlink: () => void;
  readonly suspended: boolean;
  readonly deferredCompletion: boolean;
  readonly progress: { readonly settle: () => void } | undefined;
  readonly execution: InvocationExecution;
}
