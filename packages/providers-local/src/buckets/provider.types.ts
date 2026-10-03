import type { BucketOperationContext } from "@relkit/buckets";
import type { Effect } from "effect";
import type { LocalOperationError } from "../local-effect.js";
import type { LocalBucketProvider } from "./types.js";

/** Maps a Promise boundary to its lazy typed operation. */
type Operation<F> = F extends (...args: infer Args) => infer Value
  ? (...args: Args) => Effect.Effect<Awaited<Value>, LocalOperationError>
  : never;

/** Bucket service operations preserve public payloads while owning execution. */
export type LocalBucketEffects = {
  readonly [K in "put" | "get" | "head" | "delete" | "exists" | "listPage" | "ready"]: Operation<
    LocalBucketProvider[K]
  >;
} & {
  readonly metadata: Pick<LocalBucketProvider, "capabilities" | "root" | "policy">;
  readonly validate: (
    key: string,
    context?: BucketOperationContext,
  ) => Effect.Effect<void, LocalOperationError>;
  readonly list: (
    prefix?: string,
    context?: BucketOperationContext,
  ) => Effect.Effect<readonly string[], LocalOperationError>;
  readonly close: () => Effect.Effect<void>;
  readonly inspectList: Operation<LocalBucketProvider["inspector"]["list"]>;
  readonly preview: Operation<LocalBucketProvider["inspector"]["preview"]>;
};
