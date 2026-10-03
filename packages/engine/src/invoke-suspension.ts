import type { InvokeOptions } from "./invoke-types.js";

/** Release admission after native suspension without emitting terminal completion.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns A Promise completing after lease release and signal unlinking.
 * @param args - Execution metadata and resources whose ownership is retained by this operation.
 */
export async function releaseSuspendedInvocation<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(args: {
  readonly options: InvokeOptions<Input, Output, Context>;
  readonly lease: { readonly release: () => unknown } | undefined;
  readonly admitted: boolean;
  readonly unlink: () => void;
  readonly record: import("./invoke-types.js").InvocationRecord;
}): Promise<void> {
  try {
    await args.lease?.release();
  } finally {
    try {
      await args.options.hooks?.onRelease?.({ record: args.record, admitted: args.admitted });
    } finally {
      args.unlink();
    }
  }
}
