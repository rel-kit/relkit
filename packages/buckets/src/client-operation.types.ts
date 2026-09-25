import type { Effect } from "effect";
import type { BucketProviderFailureError } from "./client-errors.js";
import type { BucketOperation, BucketOperationContext, BucketProvider } from "./client.types.js";

/** Complete arguments for one provider invocation.
 * @example const invocation: BucketInvocation<boolean> = { operation: "exists", input: { key: "a" }, work: (p) => p.exists!("a"), validate: Effect.succeed };
 */
export interface BucketInvocation<A> {
  readonly operation: BucketOperation;
  readonly input: unknown;
  readonly capability?: "signedReadUrl" | "signedWriteUrl";
  readonly work: (provider: BucketProvider, context: BucketOperationContext) => Promise<A> | A;
  readonly validate: (value: A) => Effect.Effect<A, BucketProviderFailureError>;
  readonly context?: BucketOperationContext;
}
