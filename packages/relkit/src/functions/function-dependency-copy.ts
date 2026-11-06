import { FunctionInputError } from "./function-input-error.js";
import { isRef, type DescriptorKind } from "../contracts/index.js";
import { Effect } from "effect";
import type { FunctionDependencies } from "./types.js";
import { functionTry, runFunctionSync } from "./function-observability.js";

/** Descriptor kind each dependency map holds. */
const dependencyKinds: Readonly<Record<keyof FunctionDependencies, DescriptorKind>> = {
  functions: "function",
  events: "event",
  channels: "channel",
  databases: "service",
  tasks: "task",
  jobs: "job",
  buckets: "bucket",
  cache: "cache",
  agents: "agent",
};

/** Validates and freezes a dependency map through Effect.
 * @param dependencies - Optional named dependencies.
 * @returns Frozen copy or tagged validation failure.
 * @example Effect.runSync(copyDependenciesEffect({ buckets: { uploads } }));
 */
export const copyDependenciesEffect = Effect.fn("functions.function.copy-dependencies")(
  <D extends FunctionDependencies>(
    dependencies: D | undefined,
  ): Effect.Effect<D | undefined, import("./function-observability.js").FunctionOperationError> =>
    functionTry("function.copy-dependencies", () => {
      if (dependencies === undefined) return undefined;
      if (!isRecord(dependencies))
        throw new FunctionInputError("Function dependencies must be an object");
      for (const name of Object.keys(dependencies)) {
        if (!Object.hasOwn(dependencyKinds, name))
          throw new FunctionInputError(`Unsupported function dependency map "${name}"`);
      }
      const result: Record<string, unknown> = {};
      for (const [name, kind] of Object.entries(dependencyKinds)) {
        const map = dependencies[name as keyof FunctionDependencies];
        if (map === undefined) continue;
        if (!isRecord(map))
          throw new FunctionInputError(`Function dependency map "${name}" must be an object`);
        const copied: Record<string, unknown> = {};
        for (const [client, target] of Object.entries(map)) {
          if (!isRecord(target) || !isRef(target.ref, kind)) {
            throw new FunctionInputError(`Invalid ${name} dependency "${client}"`);
          }
          if (name === "functions" && target.invocationMode === "event-only")
            throw new FunctionInputError(
              `Function dependency "${client}" is event-only and cannot be called`,
            );
          copied[client] = target;
        }
        result[name] = Object.freeze(copied);
      }
      return Object.freeze(result) as D;
    }),
);

/** Copies and validates function dependencies.
 * @param dependencies - Optional named dependencies.
 * @returns Frozen dependency maps.
 * @throws TypeError for unsupported or malformed references.
 * @example copyDependencies({ buckets: { uploads } });
 */
export function copyDependencies<D extends FunctionDependencies>(
  dependencies: D | undefined,
): D | undefined {
  return runFunctionSync(copyDependenciesEffect(dependencies));
}

/** Rejects the removed `publishes` option with the form that replaces it.
 * @param publishes - Value an authored definition passed as `publishes`.
 * @returns Nothing when the option is absent.
 * @throws FunctionInputError when the option is present.
 * @example rejectPublishes(options.publishes);
 */
export function rejectPublishes(publishes: unknown): void {
  if (publishes !== undefined)
    throw new FunctionInputError(
      "`publishes` was removed; declare each event under `dependencies.events` and publish it with `ctx.events.<name>.publish(payload)`",
    );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
