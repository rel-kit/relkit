import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import { schemaCalculations } from "./generate-schema.js";
import { recordCalculation } from "./generate-schema-render.js";
/** Collects resume payload types from every nested workflow node.
 * @param workflow - Unknown workflow document.
 * @param types - Accumulator for distinct rendered types.
 * @returns An Effect that updates the accumulator; it has no expected failure.
 * @example Effect.runSync(collectResumeTypes({ nodes: [] }, new Set()));
 */
function collectResumeTypes(workflow: unknown, types: Set<string>): Effect.Effect<void> {
  return Effect.gen(function* () {
    const document = yield* recordCalculation(workflow);
    if (document === undefined || !Array.isArray(document.nodes)) return;
    for (const value of document.nodes) {
      const node = yield* recordCalculation(value);
      if (node === undefined) continue;
      if (node.resume !== undefined) types.add(yield* schemaCalculations.typeEffect(node.resume));
      yield* collectResumeTypes(node.workflow, types);
    }
  });
}
/** Computes a deterministic union of declared resume payload types.
 * @param workflow - Unknown workflow document.
 * @returns An Effect yielding the sorted union; it has no expected failure.
 * @example Effect.runSync(agentResumeCalculations.type({ nodes: [] }));
 */
const agentResumeTypeCalculation = (workflow: unknown): Effect.Effect<string> =>
  Effect.gen(function* () {
    const types = new Set<string>();
    yield* collectResumeTypes(workflow, types);
    return [...types].sort().join(" | ") || "never";
  });
const agentResumeTypeOperation = makeGeneratorOperation(
  "agentResumeType",
  agentResumeTypeCalculation,
);
/** Renders the union of resume payloads declared by a nested agent workflow.
 * @param workflow - Agent workflow document.
 * @returns An Effect producing a sorted union, or `never` when no resume payload exists; it has no expected failure.
 * @example Effect.runSync(agentResumeTypeEffect({ nodes: [{ resume: { type: "string" } }] }));
 */
export const agentResumeTypeEffect = agentResumeTypeOperation.effect;
/** Renders the union of resume payloads for synchronous compiler callers.
 * @param workflow - Agent workflow document.
 * @returns A sorted type union, or `never` when no resume payload exists.
 * @throws If a malformed schema value causes a rendering defect.
 * @example agentResumeType({ nodes: [{ resume: { type: "string" } }] });
 */
export const agentResumeType = agentResumeTypeOperation.run;
/** Effect calculation shared by composed generator operations without starting a new runtime. @internal */
export const agentResumeCalculations = { type: agentResumeTypeCalculation } as const;
