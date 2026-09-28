import { Effect, Result } from "effect";
import { observeJobs } from "./jobs-observability.js";
import { RunLocatorError, RunLocatorFailure, verifyRunLocatorEffect } from "./run-id.js";
import { validateRunLocatorKeyRing } from "./run-id-support.js";
import type {
  RunLocatorKeyRing,
  RunLocatorVerifyOptions,
  VerifiedRunLocator,
} from "./run-id.types.js";
import {
  RunLocatorGenerationStorage,
  RunLocatorStoreFailure,
  runLocatorStoreLayer,
} from "./run-id-router-store.js";
import type { RunLocatorGeneration, RunLocatorGenerationStore } from "./run-id-router.types.js";
export type { RunLocatorGeneration, RunLocatorGenerationStore } from "./run-id-router.types.js";
export {
  RunLocatorGenerationStorage,
  RunLocatorStoreFailure,
  runLocatorStoreLayer,
} from "./run-id-router-store.js";
/** Routes signed run locators through retained service generations.
 * @example new RunLocatorRouter([{ generation: "v1", keyRing }]);
 */
export class RunLocatorRouter {
  private readonly generations = new Map<string, RunLocatorKeyRing>();
  /** Creates a router from retained generations.
   * @param generations - Generation and key-ring pairs to register.
   */
  constructor(generations: readonly RunLocatorGeneration[] = []) {
    for (const entry of generations) this.register(entry.generation, entry.keyRing);
  }
  /** Loads a router using the generation storage service.
   * @returns A router or RunLocatorStoreFailure.
   * @example Effect.runPromise(Effect.provide(RunLocatorRouter.fromStoreEffect(), runLocatorStoreLayer(store)));
   */
  static readonly fromStoreEffect = Effect.fn("Jobs.runLocatorRouterFromStore")(() =>
    observeJobs(
      "runLocator.routerLoad",
      Effect.gen(function* () {
        const store = yield* RunLocatorGenerationStorage;
        const generations = yield* Effect.tryPromise({
          try: () => Promise.resolve(store.load()),
          catch: (cause) => new RunLocatorStoreFailure({ cause }),
        });
        return yield* Effect.try({
          try: () => new RunLocatorRouter(generations),
          catch: (cause) => new RunLocatorStoreFailure({ cause }),
        });
      }),
    ),
  );
  /** Promise compatibility loader.
   * @param store - Generation storage implementation.
   * @returns A loaded router.
   * @throws The original storage error.
   * @example await RunLocatorRouter.fromStore(store);
   */
  static async fromStore(store: RunLocatorGenerationStore): Promise<RunLocatorRouter> {
    const result = await Effect.runPromise(
      Effect.result(
        Effect.provide(RunLocatorRouter.fromStoreEffect(), runLocatorStoreLayer(store)),
      ),
    );
    if (Result.isFailure(result)) throw result.failure.cause;
    return result.success;
  }
  /** Registers a generation in Effect.
   * @param generation - Stable generation name.
   * @param keyRing - Verification keys for the generation.
   * @returns Void or RunLocatorFailure.
   * @example Effect.runSync(router.registerEffect("v2", ring));
   */
  readonly registerEffect = Effect.fn("Jobs.registerRunLocatorGeneration")(
    (generation: string, keyRing: RunLocatorKeyRing) =>
      observeJobs(
        "runLocator.routerRegister",
        Effect.try({
          try: () => {
            if (!/^[A-Za-z0-9._-]{1,256}$/u.test(generation)) throw new RunLocatorError();
            validateRunLocatorKeyRing(keyRing);
            this.generations.set(generation, keyRing);
          },
          catch: (error) => {
            if (error instanceof RunLocatorError)
              return new RunLocatorFailure({ operation: "register" });
            throw error;
          },
        }),
      ),
  );
  /** Synchronous generation registration.
   * @param generation - Stable generation name.
   * @param keyRing - Verification keys.
   * @returns Void when registered.
   * @throws RunLocatorError for invalid generation or keys.
   * @example router.register("v2", ring);
   */
  register(generation: string, keyRing: RunLocatorKeyRing): void {
    const result = Effect.runSync(Effect.result(this.registerEffect(generation, keyRing)));
    if (Result.isFailure(result)) throw new RunLocatorError();
  }
  /** Returns a sorted frozen snapshot in Effect.
   * @returns Retained generations; no expected failure.
   * @example Effect.runSync(router.snapshotEffect());
   */
  readonly snapshotEffect = Effect.fn("Jobs.snapshotRunLocatorGenerations")(() =>
    observeJobs(
      "runLocator.routerSnapshot",
      Effect.sync(() =>
        Object.freeze(
          [...this.generations.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([generation, keyRing]) => Object.freeze({ generation, keyRing })),
        ),
      ),
    ),
  );
  /** Synchronous snapshot of retained generations.
   * @returns Sorted frozen generations.
   * @example router.snapshot();
   */
  snapshot(): readonly RunLocatorGeneration[] {
    return Effect.runSync(this.snapshotEffect());
  }
  /** Persists the current snapshot through the storage service.
   * @returns Void or RunLocatorStoreFailure.
   * @example Effect.runPromise(Effect.provide(router.persistEffect(), runLocatorStoreLayer(store)));
   */
  readonly persistEffect = Effect.fn("Jobs.persistRunLocatorGenerations")(() =>
    observeJobs(
      "runLocator.routerPersist",
      Effect.gen(
        function* (this: RunLocatorRouter) {
          const store = yield* RunLocatorGenerationStorage;
          const snapshot = yield* this.snapshotEffect();
          yield* Effect.tryPromise({
            try: () => Promise.resolve(store.save(snapshot)),
            catch: (cause) => new RunLocatorStoreFailure({ cause }),
          });
        }.bind(this),
      ),
    ),
  );
  /** Promise compatibility persistence.
   * @param store - Generation storage implementation.
   * @returns A Promise that resolves after saving.
   * @throws The original storage error.
   * @example await router.persist(store);
   */
  async persist(store: RunLocatorGenerationStore): Promise<void> {
    const result = await Effect.runPromise(
      Effect.result(Effect.provide(this.persistEffect(), runLocatorStoreLayer(store))),
    );
    if (Result.isFailure(result)) throw result.failure.cause;
  }
  /** Routes a locator through retained generations in Effect.
   * @param locator - Signed locator.
   * @param options - Expected application, environment, or scope.
   * @returns Verified locator or RunLocatorFailure.
   * @example Effect.runSync(router.routeEffect(locator));
   */
  readonly routeEffect = Effect.fn("Jobs.routeRunLocator")(
    (locator: string, options: Omit<RunLocatorVerifyOptions, "keyRing"> = {}) =>
      observeJobs(
        "runLocator.routerRoute",
        Effect.gen(
          function* (this: RunLocatorRouter) {
            for (const [generation, keyRing] of this.generations) {
              const result = yield* Effect.result(
                verifyRunLocatorEffect(locator, { ...options, keyRing }),
              );
              if (Result.isSuccess(result) && result.success.serviceGeneration === generation)
                return result.success;
            }
            return yield* new RunLocatorFailure({ operation: "route" });
          }.bind(this),
        ),
      ),
  );
  /** Synchronously routes a signed locator.
   * @param locator - Signed locator.
   * @param options - Expected application, environment, or scope.
   * @returns Verified locator.
   * @throws RunLocatorError when no retained generation matches.
   * @example router.route(locator);
   */
  route(
    locator: string,
    options: Omit<RunLocatorVerifyOptions, "keyRing"> = {},
  ): VerifiedRunLocator {
    const result = Effect.runSync(Effect.result(this.routeEffect(locator, options)));
    if (Result.isFailure(result)) throw new RunLocatorError();
    return result.success;
  }
}
