import { Context, Layer, Schema } from "effect";
import type { RunLocatorGenerationStore } from "./run-id-router.types.js";
/** Injectable persistence service for historical run locator generations.
 * @example Effect.provide(RunLocatorRouter.fromStoreEffect(), runLocatorStoreLayer(store));
 */
export class RunLocatorGenerationStorage extends Context.Service<
  RunLocatorGenerationStorage,
  RunLocatorGenerationStore
>()("relkit/jobs/RunLocatorGenerationStorage") {}
/** Provides a concrete generation store to Effect operations.
 * @param store - Load and save implementation.
 * @returns A Layer for RunLocatorGenerationStorage.
 * @example runLocatorStoreLayer(memoryStore);
 */
export function runLocatorStoreLayer(store: RunLocatorGenerationStore) {
  return Layer.succeed(RunLocatorGenerationStorage, store);
}
/** Failure from generation persistence, preserving the original cause.
 * @example if (error instanceof RunLocatorStoreFailure) console.log(error.message);
 */
export class RunLocatorStoreFailure extends Schema.TaggedError<RunLocatorStoreFailure>()(
  "Jobs.RunLocatorStoreFailure",
  { cause: Schema.Defect() },
) {}
