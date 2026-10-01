import type {
  AgentNode,
  ApplicationGraph,
  AgentSource,
} from "./generate-agent-procedures.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import { agentResumeCalculations } from "./generate-agent-resume.js";
import { schemaCalculations } from "./generate-schema.js";
import {
  renderTypeObjectEffect,
  renderTypePropertyEffect,
  renderTypeUnionEffect,
} from "./generate-type-syntax.js";
import {
  agentProtocolTypesEffect,
  controlInputsEffect,
  expectedIdentity,
  operationId,
  procedureEffect,
  unionEffect,
} from "./generate-agent-procedure-fragments.js";
/** Selects graph agents with client exposure before rendering their procedures.
 * @param graph - Validated application graph.
 * @returns An Effect yielding the ordered declarations; it has no expected failure.
 * @example Effect.runSync(agentProcedureCalculations.graph(graph));
 */
function agentProcedureEntriesCore(graph: ApplicationGraph): Effect.Effect<readonly string[]> {
  return entries(
    graph.nodes.filter(
      (node): node is AgentNode => node.kind === "agent" && node.client !== undefined,
    ),
  );
}
/** Validates the minimal document shape before rendering agent procedures.
 * @param value - Unknown agent document list.
 * @returns An Effect yielding entries for valid agents; it has no expected failure.
 * @example Effect.runSync(agentProcedureCalculations.document([{ id: "assistant", input: {} }]));
 */
function agentProcedureEntriesFromDocumentCore(value: unknown): Effect.Effect<readonly string[]> {
  return Effect.gen(function* () {
    const agents: AgentSource[] = [];
    if (Array.isArray(value)) {
      for (const agent of value) {
        if (agent === null || typeof agent !== "object" || Array.isArray(agent)) continue;
        if (typeof agent.id !== "string" || agent.input === undefined) continue;
        agents.push(agent);
      }
    }
    return yield* entries(agents);
  });
}
/** Builds the shared protocol entries and ordered run/control unions.
 * @param agents - Valid agent documents in declaration order.
 * @returns An Effect yielding protocol entries; it has no expected failure.
 * @example Effect.runSync(entries([{ id: "assistant", input: {} }]));
 */
function entries(agents: readonly AgentSource[]): Effect.Effect<readonly string[]> {
  return Effect.gen(function* () {
    if (agents.length === 0) return [];
    const scoped = (fields: readonly string[]) =>
      Effect.gen(function* () {
        const variants: string[] = [];
        for (const agent of agents)
          variants.push(
            yield* renderTypeObjectEffect([
              yield* renderTypePropertyEffect("agentId", JSON.stringify(agent.id)),
              ...fields,
            ]),
          );
        return yield* unionEffect(variants);
      });
    const { threadList, runReceipt, controlReceipt, receiptFields, receiptLookup } =
      yield* agentProtocolTypesEffect();
    const run: string[] = [];
    for (const agent of agents) run.push(...(yield* runInputs(agent)));
    const controls: string[] = [];
    for (const agent of agents) controls.push(...(yield* controlInputsEffect(agent)));
    return [
      yield* procedureEffect("relkit.agent.threads", yield* scoped([expectedIdentity]), threadList),
      yield* procedureEffect(
        "relkit.agent.load",
        yield* scoped([yield* renderTypePropertyEffect("threadId", "string"), expectedIdentity]),
        'import("@relkit/contracts").ThreadSnapshot',
      ),
      yield* procedureEffect(
        "relkit.agent.observe",
        yield* scoped([
          yield* renderTypePropertyEffect("threadId", "string"),
          yield* renderTypePropertyEffect("after", 'import("@relkit/contracts").JournalCheckpoint'),
          expectedIdentity,
        ]),
        'AsyncIterable<import("@relkit/contracts").AgentObservation>',
      ),
      yield* procedureEffect("relkit.agent.run", yield* unionEffect(run), runReceipt),
      yield* procedureEffect("relkit.agent.control", yield* unionEffect(controls), controlReceipt),
      yield* procedureEffect("relkit.agent.receipt", yield* scoped(receiptFields), receiptLookup),
      yield* procedureEffect(
        "relkit.agent.history",
        yield* scoped([
          yield* renderTypePropertyEffect("threadId", "string"),
          yield* renderTypePropertyEffect("snapshotId", "string"),
          yield* renderTypePropertyEffect("cursor", "string"),
          expectedIdentity,
        ]),
        '{ readonly messages: readonly import("@relkit/contracts").BrowserMessage[]; readonly nextCursor?: string }',
      ),
    ];
  });
}
/** Renders initial and resumable run inputs for one agent.
 * @param agent - Agent input and workflow metadata.
 * @returns An Effect yielding one or two run variants; it has no expected failure.
 * @example Effect.runSync(runInputs({ id: "assistant", input: {} }));
 */
const runInputs = Effect.fnUntraced(function* (agent: AgentSource) {
  const common = [
    yield* renderTypePropertyEffect("agentId", JSON.stringify(agent.id)),
    yield* renderTypePropertyEffect("threadId", "string"),
    operationId,
    yield* renderTypePropertyEffect("requestDigest", "string", { optional: true }),
    expectedIdentity,
  ];
  const input = yield* schemaCalculations.typeEffect(agent.input);
  const payload =
    agent.chat === undefined || agent.chat === null
      ? input
      : yield* renderTypeUnionEffect([input, "string"]);
  const initial = yield* renderTypeObjectEffect([
    ...common,
    yield* renderTypePropertyEffect("resume", "false", { optional: true }),
    yield* renderTypePropertyEffect("payload", payload),
  ]);
  const resume = yield* agentResumeCalculations.type(agent.workflow);
  return resume === "never"
    ? [initial]
    : [
        initial,
        yield* renderTypeObjectEffect([
          ...common,
          yield* renderTypePropertyEffect("resume", "true"),
          yield* renderTypePropertyEffect("waitingRevision", "string"),
          yield* renderTypePropertyEffect("payload", resume),
        ]),
      ];
});
const agentProcedureEntriesOperation = makeGeneratorOperation(
  "agentProcedureEntries",
  agentProcedureEntriesCore,
);
/** Builds agent protocol procedure entries from graph nodes in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(agentProcedureEntriesEffect(graph));
 */
export const agentProcedureEntriesEffect = agentProcedureEntriesOperation.effect;
/** Builds agent protocol procedure entries from graph nodes synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example agentProcedureEntries(graph);
 */
export const agentProcedureEntries = agentProcedureEntriesOperation.run;
const agentProcedureEntriesFromDocumentOperation = makeGeneratorOperation(
  "agentProcedureEntriesFromDocument",
  agentProcedureEntriesFromDocumentCore,
);
/** Builds agent protocol procedure entries from a document in an observed Effect.
 * @param value - Document or schema value to render.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(agentProcedureEntriesFromDocumentEffect(value));
 */
export const agentProcedureEntriesFromDocumentEffect =
  agentProcedureEntriesFromDocumentOperation.effect;
/** Builds agent protocol procedure entries from a document synchronously for existing callers.
 * @param value - Document or schema value to render.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example agentProcedureEntriesFromDocument(value);
 */
export const agentProcedureEntriesFromDocument = agentProcedureEntriesFromDocumentOperation.run;
/** Effect calculations reused within parent generator operations without starting another runtime. @internal */
export const agentProcedureCalculations = {
  graph: agentProcedureEntriesCore,
  document: agentProcedureEntriesFromDocumentCore,
} as const;
