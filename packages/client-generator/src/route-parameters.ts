import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import type { RouteParameter } from "./route-parameters.types.js";
export type { RouteParameter } from "./route-parameters.types.js";
/** Parses named and catch-all route parameters while preserving path order.
 * @param path - HTTP route path.
 * @returns An Effect yielding ordered parameters; it has no expected failure.
 * @example Effect.runSync(routeParameterCalculations.parseEffect("/users/:id"));
 */
const routeParametersCore = Effect.fnUntraced(function* (path: string) {
  const parameters: RouteParameter[] = [];
  for (const segment of path.split("/")) {
    if (!segment.startsWith(":") && !segment.startsWith("*")) continue;
    parameters.push({
      segment,
      name: segment.slice(1).replace(/\?$/, ""),
      kind: segment.startsWith("*") ? "path-segments" : "path",
      optional: segment.endsWith("?"),
    });
  }
  return parameters;
});
const routeParametersOperation = makeGeneratorOperation("routeParameters", routeParametersCore);
/** Parses named and catch-all parameters from an HTTP route path.
 * @param path - Property or route path.
 * @returns An Effect with the rendered result and no expected typed failures.
 * @example Effect.runSync(routeParametersEffect(path));
 */
export const routeParametersEffect = routeParametersOperation.effect;
/** Parses HTTP route parameters for synchronous compiler callers.
 * @param path - Property or route path.
 * @returns The rendered result.
 * @throws If malformed trusted input causes a defect.
 * @example routeParameters(path);
 */
export const routeParameters = routeParametersOperation.run;
/** Route parsing shared by composed generator operations. @internal */
export const routeParameterCalculations = {
  parse: routeParametersOperation.run,
  parseEffect: routeParametersCore,
} as const;
