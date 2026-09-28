import { FunctionInputError } from "./function-input-error.js";
import { isRef, type DescriptorKind } from "@relkit/contracts";
import { Effect } from "effect";
import type { FunctionDependencies } from "./types.js";
import { functionTry, runFunctionSync } from "./function-observability.js";

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
      if (Object.hasOwn(dependencies, "functions")) {
        throw new FunctionInputError(
          "Function dependencies are not supported; use descriptor.invoke",
        );
      }
      if (Object.hasOwn(dependencies, "events")) {
        throw new FunctionInputError(
          "Event dependencies are not supported; declare publishes instead",
        );
      }
      const result: Record<string, unknown> = {};
      const kinds: Readonly<Record<string, DescriptorKind>> = {
        tasks: "task",
        jobs: "job",
        buckets: "bucket",
        cache: "cache",
        agents: "agent",
      };
      for (const [name, kind] of Object.entries(kinds)) {
        const map = dependencies[name as keyof FunctionDependencies];
        if (map === undefined) continue;
        if (!isRecord(map))
          throw new FunctionInputError(`Function dependency map "${name}" must be an object`);
        const copied: Record<string, unknown> = {};
        for (const [client, target] of Object.entries(map)) {
          if (!isRecord(target) || !isRef(target.ref, kind)) {
            throw new FunctionInputError(`Invalid ${name} dependency "${client}"`);
          }
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

/** Validates a published event list through Effect.
 * @param publishes - Optional event IDs.
 * @returns Frozen normalized IDs or tagged validation failure.
 * @example Effect.runSync(copyPublishesEffect(["orders.created"]));
 */
export const copyPublishesEffect = Effect.fn("functions.function.copy-publishes")(
  <Names extends readonly string[]>(
    publishes: Names | undefined,
  ): Effect.Effect<
    Names | undefined,
    import("./function-observability.js").FunctionOperationError
  > =>
    functionTry("function.copy-publishes", () => {
      if (publishes === undefined) return undefined;
      if (!Array.isArray(publishes))
        throw new FunctionInputError("Function publishes must be an array");
      const values = publishes.map((eventId) => {
        if (typeof eventId !== "string" || eventId.trim() === "") {
          throw new FunctionInputError("Function publishes entries must be non-empty event IDs");
        }
        return eventId.trim();
      });
      if (new Set(values).size !== values.length) {
        throw new FunctionInputError("Function publishes entries must be unique");
      }
      return Object.freeze(values) as unknown as Names;
    }),
);

/** Copies and validates published event IDs.
 * @param publishes - Optional event IDs.
 * @returns Frozen normalized event IDs.
 * @throws TypeError for duplicate or empty IDs.
 * @example copyPublishes(["orders.created"]);
 */
export function copyPublishes<Names extends readonly string[]>(
  publishes: Names | undefined,
): Names | undefined {
  return runFunctionSync(copyPublishesEffect(publishes));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
