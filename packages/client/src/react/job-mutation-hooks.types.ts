import type { UseMutationOptions } from "@tanstack/react-query";

/**
 * Job mutation options preserving operation identity, retry and TanStack callback inference.
 * @typeParam Output - Application-declared successful result payload.
 * @typeParam Failure - Declared procedure failure exposed by the existing contract.
 * @typeParam Input - Original declared request payload.
 * @typeParam Context - Caller-provided mutation callback context.
 */
export type JobMutationOptions<Output, Failure, Input, Context> = Omit<
  UseMutationOptions<Output, Failure, Input, Context>,
  "mutationKey" | "mutationFn"
> & { readonly jobId?: string };
