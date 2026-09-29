import type { JsonValue, ApplicationGraph, ClientRoute } from "./generate-contract.types.js";
import { Effect } from "effect";
import { makeGraphOperation } from "./generator-graph-operation.js";
import { canonicalJson, CONTRACT_VERSION } from "@relkit/contracts";
import { contractFromDocumentCalculations } from "./generate-contract-from-document.js";
import { registryCalculations } from "./generate-registry-fingerprint.js";
import { manifestCalculations } from "./generate-public-manifest.js";
import { agentProcedureCalculations } from "./generate-agent-procedures.js";
import { jobProcedureCalculations } from "./generate-job-procedures.js";
import { recordCalculation } from "./generate-schema-render.js";
export type { ContractProcedureDocument } from "./generate-contract.types.js";
export {
  generateContractFromDocument,
  generateContractFromDocumentEffect,
} from "./generate-contract-from-document.js";
/** Resolves graph route aliases and agent procedures before rendering the contract.
 * @param graph - Validated application graph.
 * @param routes - Resolved public HTTP routes.
 * @returns An Effect yielding generated source; it has no expected failure.
 * @example Effect.runSync(generateContractCore(graph, routes));
 */
function generateContractCore(
  graph: ApplicationGraph,
  routes: readonly ClientRoute[],
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const agentEntries = yield* agentProcedureCalculations.graph(graph);
    const jobs = yield* jobProcedureCalculations.graphSourcesEffect(graph);
    const procedures = [];
    for (const route of routes) {
      const declaredErrors = yield* errorsCalculation(route.target.errors);
      for (const name of new Set([
        route.trigger.id,
        `${route.trigger.config.method} ${route.trigger.config.path}`,
      ])) {
        procedures.push({
          name,
          input: route.target.input,
          output: route.target.output,
          errors: declaredErrors,
        });
      }
    }
    return yield* contractFromDocumentCalculations.renderEffect(procedures, agentEntries, jobs);
  });
}
/** Serializes public procedure metadata and its graph fingerprint.
 * @param graph - Validated application graph.
 * @param routes - Resolved public HTTP routes.
 * @param graphHash - Graph content hash.
 * @returns An Effect yielding the canonical JSON document; it has no expected failure.
 * @example Effect.runSync(generateClientContractDocumentCore(graph, routes, "hash"));
 */
function generateClientContractDocumentCore(
  graph: ApplicationGraph,
  routes: readonly ClientRoute[],
  graphHash: string,
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const procedures = [];
    for (const route of routes)
      procedures.push({
        name: route.trigger.id,
        selector: `${route.trigger.config.method} ${route.trigger.config.path}`,
        routeId: route.trigger.id,
        functionId: route.target.id,
        input: route.target.input,
        output: route.target.output,
        errors: yield* errorDocumentsCalculation(route.target.errors, route.responses),
        route: {
          method: route.trigger.config.method,
          path: route.trigger.config.path,
          operation:
            route.trigger.config.client === false
              ? "query"
              : (route.trigger.config.client?.operation ?? "query"),
        },
      });
    return `${canonicalJson({
      ...(yield* manifestCalculations.buildEffect(graph, routes)),
      protocol: "relkit.client-contract",
      version: CONTRACT_VERSION,
      graphHash,
      publicFingerprint: yield* registryCalculations.fingerprintEffect(graph, routes),
      procedures,
    } as unknown as JsonValue)}\n`;
  });
}
/** Adds HTTP statuses to declared error schemas for the contract document.
 * @param value - Unknown declared errors.
 * @param responses - HTTP response statuses for those errors.
 * @returns An Effect yielding JSON error documents; it has no expected failure.
 * @example Effect.runSync(errorDocumentsCalculation([], []));
 */
const errorDocumentsCalculation = Effect.fnUntraced(function* (
  value: unknown,
  responses: readonly { readonly errorId?: string; readonly status: number }[],
) {
  const declared = yield* errorsCalculation(value);
  return declared.map((entry) => ({
    id: entry.id,
    schema: entry.schema as JsonValue,
    status: responses.find((response) => response.errorId === entry.id)?.status ?? 500,
  })) as JsonValue;
});
/** Normalizes declared error documents and unwraps their JSON Schema data.
 * @param value - Unknown compiler error metadata.
 * @returns An Effect yielding valid declared errors; it has no expected failure.
 * @example Effect.runSync(errorsCalculation([{ id: "Denied", data: {} }]));
 */
const errorsCalculation = Effect.fnUntraced(function* (value: unknown) {
  const declared: { readonly id: string; readonly schema: unknown }[] = [];
  if (!Array.isArray(value)) return declared;
  for (const item of value) {
    const entry = yield* recordCalculation(item);
    if (entry === undefined || typeof entry.id !== "string") continue;
    const data = yield* recordCalculation(entry.data);
    const nested = data === undefined ? undefined : yield* recordCalculation(data.jsonSchema);
    declared.push({ id: entry.id, schema: nested ?? entry.data ?? {} });
  }
  return declared;
});
const generateContractOperation = makeGraphOperation("generateContract", generateContractCore);
/** Renders the graph-backed oRPC contract module in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and MissingRouteTarget when an HTTP trigger references a missing function.
 * @example Effect.runSync(generateContractEffect(graph));
 */
export const generateContractEffect = generateContractOperation.effect;
/** Renders the graph-backed oRPC contract module synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws TypeError for a missing route target; otherwise a defect for malformed trusted input.
 * @example generateContract(graph);
 */
export const generateContract = generateContractOperation.run;
const generateClientContractDocumentOperation = makeGraphOperation(
  "generateClientContractDocument",
  generateClientContractDocumentCore,
);
/** Serializes the public client contract document in an observed Effect.
 * @param graph - Application graph to inspect.
 * @param graphHash - Hash of the graph used to build this contract document.
 * @returns An Effect with the generated value and MissingRouteTarget when an HTTP trigger references a missing function.
 * @example Effect.runSync(generateClientContractDocumentEffect(graph, graphHash));
 */
export const generateClientContractDocumentEffect = generateClientContractDocumentOperation.effect;
/** Serializes the public client contract document synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @param graphHash - Hash of the graph used to build this contract document.
 * @returns The generated value.
 * @throws TypeError for a missing route target; otherwise a defect for malformed trusted input.
 * @example generateClientContractDocument(graph, graphHash);
 */
export const generateClientContractDocument = generateClientContractDocumentOperation.run;
