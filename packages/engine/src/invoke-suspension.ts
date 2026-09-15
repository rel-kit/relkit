import type { InvokeOptions } from "./invoke-types.js";

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
