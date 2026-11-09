import type {
  ApplicationGraph,
  FunctionNode,
  InputTree,
  ClientRoute,
  HttpGraphTrigger,
  MappingLeaf,
  ResponseContract,
} from "./generate-types.types.js";
import { makeGeneratorOperation } from "./generator-operation.js";
import { Effect, Schema } from "effect";
import { schemaCalculations } from "./generate-schema.js";
import { inputTreeCalculations } from "./input-tree.js";
export type { ClientRoute, MappingLeaf, ResponseContract } from "./generate-types.types.js";
import { routeParameterCalculations } from "./route-parameters.js";
import { mappingCalculations } from "./generate-mappings.js";
import { observeGenerator, runGenerator } from "./generator-observability.js";
import { recordCalculation } from "./generate-schema-render.js";
/** A trigger references a function missing from the application graph.
 * @example new MissingRouteTarget({ triggerId: "orders.get", targetFunctionId: "orders.read" });
 */
export class MissingRouteTarget extends Schema.TaggedError<MissingRouteTarget>()(
  "ClientGenerator.MissingRouteTarget",
  { triggerId: Schema.String, targetFunctionId: Schema.String },
) {}
/** Resolves public HTTP routes, failing with a tagged missing-target error.
 * @param graph - Application graph to inspect.
 * @returns An Effect with ordered routes or MissingRouteTarget.
 * @example Effect.runSync(clientRoutesEffect(graph));
 */
export const clientRoutesEffect = Effect.fn("clientGenerator.clientRoutes")(
  (graph: ApplicationGraph) =>
    observeGenerator(
      "clientRoutes",
      Effect.gen(function* () {
        const functions = new Map(
          graph.nodes
            .filter((node): node is FunctionNode => node.kind === "function")
            .map((node) => [node.id, node]),
        );
        const routes: ClientRoute[] = [];
        for (const node of graph.nodes) {
          const trigger = yield* httpTriggerEffect(node);
          if (trigger === undefined) continue;
          const target = functions.get(trigger.targetFunctionId);
          if (target === undefined) {
            return yield* Effect.fail(
              new MissingRouteTarget({
                triggerId: trigger.id,
                targetFunctionId: trigger.targetFunctionId,
              }),
            );
          }
          routes.push({
            trigger,
            target,
            fields: yield* mappingCalculations.collectEffect(trigger.config.request),
            responses: yield* mappingCalculations.responsesEffect(trigger.config.responses),
          });
        }
        return routes.sort((left, right) => left.trigger.id.localeCompare(right.trigger.id));
      }),
    ),
);
/** Synchronous route-resolution compatibility adapter.
 * @param graph - Application graph to inspect.
 * @returns Ordered public HTTP routes.
 * @throws TypeError when a trigger targets a missing function.
 * @example clientRoutes(graph);
 */
export function clientRoutes(graph: ApplicationGraph): readonly ClientRoute[] {
  try {
    return runGenerator(clientRoutesEffect(graph));
  } catch (error) {
    if (error instanceof MissingRouteTarget) {
      throw new TypeError(
        `HTTP trigger "${error.triggerId}" targets missing function "${error.targetFunctionId}".`,
      );
    }
    throw error;
  }
}
/** Combines request mapping leaves and implicit route parameters into an input type.
 * @param route - Resolved HTTP route.
 * @returns An Effect yielding the input type; it has no expected failure.
 * @example Effect.runSync(mappedInputTypeEffect(route));
 */
function mappedInputTypeCore(route: ClientRoute): Effect.Effect<string> {
  return Effect.gen(function* () {
    const root: InputTree = { fields: new Map() };
    if (route.fields.some((field) => field.kind === "whole-body" && field.inputPath.length === 0))
      return yield* schemaCalculations.typeEffect(route.target.input);
    for (const field of route.fields) {
      if (field.kind === "constant") continue;
      const schema = yield* schemaCalculations.atEffect(route.target.input, field.inputPath);
      yield* inputTreeCalculations.addEffect(
        root,
        field.inputPath,
        yield* schemaCalculations.typeEffect(
          schema ??
            (["path", "path-segments", "query", "header", "cookie"].includes(field.kind)
              ? { type: "string" }
              : undefined),
        ),
        { optional: field.optional || field.defaulted },
      );
    }
    for (const parameter of yield* routeParameterCalculations.parseEffect(
      route.trigger.config.path,
    )) {
      if (
        route.fields.some((field) => field.kind === parameter.kind && field.name === parameter.name)
      )
        continue;
      yield* inputTreeCalculations.addEffect(
        root,
        [parameter.name],
        yield* schemaCalculations.typeEffect(
          parameter.kind === "path-segments"
            ? { type: "array", items: { type: "string" } }
            : { type: "string" },
        ),
        { optional: parameter.optional },
      );
    }
    return yield* inputTreeCalculations.renderEffect(root);
  });
}
/** Selects and renders the schema for one response contract.
 * @param route - Resolved HTTP route.
 * @param response - Declared response metadata.
 * @returns An Effect yielding a response type; it has no expected failure.
 * @example Effect.runSync(responseTypeEffect(route, response));
 */
function responseTypeCore(route: ClientRoute, response: ResponseContract): Effect.Effect<string> {
  return Effect.gen(function* () {
    const schema =
      response.kind === "error"
        ? yield* schemaCalculations.responseEffect(route, response)
        : (response.schema ?? (yield* schemaCalculations.responseEffect(route, response)));
    return yield* schemaCalculations.typeEffect(schema);
  });
}
/** Selects public HTTP triggers from application graph nodes.
 * @param node - Graph node to inspect.
 * @returns An Effect yielding a trigger or `undefined`; it has no expected failure.
 * @example Effect.runSync(httpTriggerEffect(node));
 */
const httpTriggerEffect = Effect.fnUntraced(function* (node: ApplicationGraph["nodes"][number]) {
  if (node.kind !== "trigger") return undefined;
  const config = yield* recordCalculation(node.config);
  return node.triggerType === "http" &&
    config !== undefined &&
    config.rawHandler !== true &&
    config.client !== false
    ? (node as HttpGraphTrigger)
    : undefined;
});
const mappedInputTypeOperation = makeGeneratorOperation("mappedInputType", mappedInputTypeCore);
/** Renders the mapped input type for an HTTP route in an observed Effect.
 * @param route - Resolved HTTP route.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(mappedInputTypeEffect(route));
 */
export const mappedInputTypeEffect = mappedInputTypeOperation.effect;
/** Renders the mapped input type for an HTTP route synchronously for existing callers.
 * @param route - Resolved HTTP route.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example mappedInputType(route);
 */
export const mappedInputType = mappedInputTypeOperation.run;
const responseTypeOperation = makeGeneratorOperation("responseType", responseTypeCore);
/** Renders the TypeScript body type for one HTTP response.
 * @param route - Resolved HTTP route containing the target function.
 * @param response - Response contract to render.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(responseTypeEffect(route, response));
 */
export const responseTypeEffect = responseTypeOperation.effect;
/** Renders the response body type for synchronous compiler callers.
 * @param route - Resolved HTTP route containing the target function.
 * @param response - Response contract to render.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example responseType(route, response);
 */
export const responseType = responseTypeOperation.run;
