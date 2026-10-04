import type { Effect } from "effect";
import type { TestJobCloseOptions, TestJobFake } from "./jobs-types.js";

/** Native inspection and Effect workflows over one durable job generation. */
export interface JobHarnessService {
  readonly value: TestJobFake<never, unknown>;
  readonly runNext: (
    id?: string,
  ) => Effect.Effect<Awaited<ReturnType<TestJobFake["runNext"]>>, unknown>;
  readonly drain: Effect.Effect<Awaited<ReturnType<TestJobFake["drain"]>>, unknown>;
  readonly restart: Effect.Effect<void, unknown>;
  readonly close: (options?: TestJobCloseOptions) => Effect.Effect<void, unknown>;
}
