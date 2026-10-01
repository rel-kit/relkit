import type { ClientRoute, RouteMethodNames } from "./generate-request.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import { routeParameterCalculations } from "./route-parameters.js";
import {
  bodyStatementsEffect,
  hasBodyEffect,
  headerStatementsEffect,
  pathStatementsEffect,
  queryStatementsEffect,
} from "./generate-request-statements.js";
export { runtimeHelpers, runtimeHelpersEffect } from "./generate-runtime-helpers.js";
export type { RouteMethodNames } from "./generate-request.types.js";
/** Checks whether all generated request fields and route parameters are optional.
 * @param route - Resolved HTTP route.
 * @returns An Effect yielding whether input may be omitted; it has no expected failure.
 * @example Effect.runSync(acceptsMissingInputEffect(route));
 */
const acceptsMissingInputCore = Effect.fnUntraced(function* (route: ClientRoute) {
  const parameters = yield* routeParameterCalculations.parseEffect(route.trigger.config.path);
  const requiredUnmappedPath = parameters.some(
    (parameter) =>
      !parameter.optional &&
      !route.fields.some((field) => field.kind === parameter.kind && field.name === parameter.name),
  );
  return (
    !requiredUnmappedPath &&
    route.fields.every((field) => field.kind === "constant" || field.optional || field.defaulted)
  );
});
/** Renders a request method with path, query, headers, body, and response handling.
 * @param route - Resolved HTTP route.
 * @param names - Generated method and type names.
 * @returns An Effect yielding request method lines; it has no expected failure.
 * @example Effect.runSync(routeMethodEffect(route, names));
 */
const routeMethodCore = Effect.fnUntraced(function* (route: ClientRoute, names: RouteMethodNames) {
  const optional = yield* acceptsMissingInputCore(route);
  const lines = [
    `    async ${names.method}(input${optional ? `: ${names.type}Input = {} as ${names.type}Input` : `: ${names.type}Input`}) {`,
    `      let path = ${JSON.stringify(route.trigger.config.path)};`,
  ];
  lines.push(...(yield* pathStatementsEffect(route)));
  const query = yield* queryStatementsEffect(route);
  const headers = yield* headerStatementsEffect(route);
  const body = yield* bodyStatementsEffect(route);
  const hasBody = yield* hasBodyEffect(route);
  lines.push(
    "      const query = new URLSearchParams();",
    ...query,
    "      const queryString = query.toString();",
    '      const url = joinUrl(baseUrl, path) + (queryString === "" ? "" : `?${queryString}`);',
    "      const headers: Record<string, string> = {};",
    ...headers,
    ...body,
    `      const result = await request(fetcher, url, { method: ${JSON.stringify(route.trigger.config.method)}, headers, ...(${hasBody ? "requestBody === undefined ? {} : { body: requestBody }" : "{}"}) });`,
    `      return result as ${names.type}Result;`,
    "    },",
  );
  return lines;
});
const routeMethodOperation = makeGeneratorOperation("routeMethod", routeMethodCore);
/** Renders a generated REST request method in an observed Effect.
 * @param route - Resolved HTTP route.
 * @param names - Method and type names for generated code.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(routeMethodEffect(route, names));
 */
export const routeMethodEffect = routeMethodOperation.effect;
/** Renders a generated REST request method synchronously for existing callers.
 * @param route - Resolved HTTP route.
 * @param names - Method and type names for generated code.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example routeMethod(route, names);
 */
export const routeMethod = routeMethodOperation.run;
const acceptsMissingInputOperation = makeGeneratorOperation(
  "acceptsMissingInput",
  acceptsMissingInputCore,
);
/** Determines whether a generated route method can omit its input in an observed Effect.
 * @param route - Resolved HTTP route.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(acceptsMissingInputEffect(route));
 */
export const acceptsMissingInputEffect = acceptsMissingInputOperation.effect;
/** Determines whether a generated route method can omit its input synchronously for existing callers.
 * @param route - Resolved HTTP route.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example acceptsMissingInput(route);
 */
export const acceptsMissingInput = acceptsMissingInputOperation.run;
