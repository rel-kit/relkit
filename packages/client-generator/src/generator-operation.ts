import { Effect } from "effect";
import { observeGenerator, runGenerator } from "./generator-observability.js";
/** Creates a traced Effect operation and its synchronous compatibility adapter.
 * @param name - Static operation name.
 * @param calculate - Effect calculation that composes its helpers without starting another runtime.
 * @returns An Effect yielding the operation pair with no expected failure.
 * @example Effect.runSync(makeGeneratorOperationEffect("render", (value: string) => Effect.succeed(value)));
 */
export function makeGeneratorOperationEffect<Args extends readonly unknown[], A, E = never>(
  name: string,
  calculate: (...args: Args) => Effect.Effect<A, E>,
): Effect.Effect<{
  readonly effect: (...args: Args) => Effect.Effect<A, E>;
  readonly run: (...args: Args) => A;
}> {
  return observeGenerator(
    "makeGeneratorOperation",
    Effect.sync(() => {
      const effect = Effect.fn(`clientGenerator.${name}`)((...args: Args) =>
        observeGenerator(name, calculate(...args)),
      );
      return { effect, run: (...args: Args) => runGenerator(effect(...args)) };
    }),
  );
}

/** Creates an observed generator operation for synchronous module setup.
 * @param name - Static operation name.
 * @param calculate - Effect calculation to expose.
 * @returns The Effect operation and synchronous compatibility adapter.
 * @throws If operation setup defects.
 * @example const operation = makeGeneratorOperation("render", (value: string) => Effect.succeed(value));
 */
export function makeGeneratorOperation<Args extends readonly unknown[], A, E = never>(
  name: string,
  calculate: (...args: Args) => Effect.Effect<A, E>,
): {
  readonly effect: (...args: Args) => Effect.Effect<A, E>;
  readonly run: (...args: Args) => A;
} {
  return runGenerator(makeGeneratorOperationEffect(name, calculate));
}
