import { Effect, Layer, Logger, ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import { GeneratorFileSystem, generatorFileSystemLive } from "./generator-filesystem.js";
import { GeneratorProcess, generatorProcessLive } from "./generator-process.js";
import { publicFailure } from "./generator-errors.js";
import { GeneratorPaths, generatorPathsLive } from "./generator-paths.js";

/** Shared stateless I/O owner; project state and temporary resources belong to individual scopes. */
const ioLive = Layer.merge(
  Layer.merge(generatorFileSystemLive, generatorProcessLive),
  generatorPathsLive,
);
const generatorRuntime = ManagedRuntime.make(Layer.merge(ioLive, Logger.layer([])));

/**
 * Runs a public Promise compatibility edge without changing rejection identity.
 * @typeParam A - Public successful value.
 * @typeParam E - Internal typed failure.
 * @param effect - Domain workflow requiring only explicitly assembled I/O authority.
 * @param signal - Optional caller-owned cancellation signal.
 * @returns The public value, after all scoped finalizers have completed.
 */
export function runGeneratorPromise<A, E>(
  effect: Effect.Effect<A, E, GeneratorFileSystem | GeneratorProcess | GeneratorPaths>,
  signal?: AbortSignal,
): Promise<A> {
  return runExecutionPromise(
    generatorRuntime,
    effect.pipe(Effect.mapError(publicFailure)),
    signal === undefined ? undefined : { signal },
  );
}

/**
 * Runs a pure synchronous compatibility edge in the shared owner.
 * @typeParam A - Public synchronous value.
 * @typeParam E - Expected validation failure.
 * @param effect - Pure synchronously completable operation.
 * @returns Its value, preserving original rejection identity.
 */
export function runGeneratorSync<A, E>(effect: Effect.Effect<A, E, GeneratorPaths>): A {
  return runExecutionSync(generatorRuntime, effect.pipe(Effect.mapError(publicFailure)));
}
