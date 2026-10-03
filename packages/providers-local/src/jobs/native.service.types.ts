import type { JobsAdapterRuntime } from "@relkit/jobs/adapter";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { Effect, Stream } from "effect";
import type { LocalOperationError } from "../local-effect.js";

/** Converts a native adapter operation into its internal lazy workflow. */
type Operation<F> = F extends (...args: infer Args) => infer Value
  ? (...args: Args) => Effect.Effect<Awaited<Value>, LocalOperationError>
  : never;

/** Worker state transitions all share the provider's serialization owner. */
export type NativeWorkerEffects = {
  readonly [K in keyof Required<NonNullable<JobsAdapterRuntime["worker"]>>]: Operation<
    Required<NonNullable<JobsAdapterRuntime["worker"]>>[K]
  >;
};

/** Native jobs contract with typed workflows and an owned observation stream. */
export type NativeJobEffects = {
  readonly [K in "submit" | "get" | "list" | "cancel" | "retry" | "close"]: Operation<
    JobsAdapterRuntime[K]
  >;
} & {
  readonly metadata: Pick<JobsAdapterRuntime, "kind" | "protocolVersion" | "capabilities">;
  readonly worker: NativeWorkerEffects;
  readonly observe: (
    ...args: Parameters<NonNullable<JobsAdapterRuntime["observe"]>>
  ) => Stream.Stream<RunWatchFrame<RunSnapshot>, LocalOperationError>;
};

/** Serialized mutation runner shared by provider and worker operations. */
export type NativeMutation = <A>(
  operation: string,
  effect: Effect.Effect<A, LocalOperationError>,
) => Effect.Effect<A, LocalOperationError>;
