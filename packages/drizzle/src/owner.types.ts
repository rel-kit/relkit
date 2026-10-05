import type { Context, Effect, Latch, ManagedRuntime, Ref } from "effect";
import type { DrizzleFailure } from "./failure.js";
import type { DrizzleOwner } from "./owner.js";

/** Atomic owner admission state; close is monotonic. */
export interface AdmissionState {
  readonly closing: boolean;
  readonly active: number;
}

/** Shared live/test contract for one client lifetime. */
export interface DrizzleOwnerInterface {
  readonly client: unknown;
  readonly admission: Ref.Ref<AdmissionState>;
  readonly drained: Latch.Latch;

  /**
   * Admits lazy work while preserving its caller requirements and causes.
   * @typeParam A - Successful caller result.
   * @typeParam E - Caller typed failure.
   * @typeParam R - Required caller services.
   * @param effect - SDK adapter work retaining its lease until native settlement.
   * @returns Lazy caller work or a typed closed-owner admission failure.
   */
  readonly work: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | DrizzleFailure, R>;

  /**
   * Marks admission closed monotonically.
   * @returns Lazy state transition; already admitted work retains its lease.
   */
  readonly beginClose: () => Effect.Effect<void>;

  /**
   * Awaits all previously admitted native work.
   * @returns Lazy drain barrier; resource disposal must follow this completion.
   */
  readonly awaitDrained: () => Effect.Effect<void>;
}

/** Private association; the public activation remains frozen. */
export interface OwnerBinding {
  readonly dialect: "sqlite" | "pg" | "mysql";
  readonly service: DrizzleOwnerInterface;
  readonly runtime: ManagedRuntime.ManagedRuntime<DrizzleOwner, DrizzleFailure>;
  readonly instrumentation: Context.Context<never>;
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
}
