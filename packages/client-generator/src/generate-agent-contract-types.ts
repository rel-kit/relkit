import { Effect } from "effect";
import type { AgentContractSource } from "./generate-agent-contract-types.types.js";
import { schemaCalculations } from "./generate-schema.js";
import { makeGeneratorOperation } from "./generator-operation.js";
import {
  eventTypeEffect,
  resumeTypeEffect,
  scopeTypeEffect,
  stateTypeEffect,
  toolTypeEffect,
  waitingTypeEffect,
} from "./generate-agent-contract-fragments.js";
/** Composes the input, output, control, resume, and React contract types for one agent.
 * @param agent - Public agent metadata and optional client contract.
 * @returns An Effect yielding a contract type; it has no expected failure.
 * @example Effect.runSync(agentContractCalculations.type({ input: {}, output: {} }));
 */
function agentContractTypeCore(agent: AgentContractSource): Effect.Effect<string> {
  return Effect.gen(function* () {
    const controls = Array.isArray(agent.controls)
      ? agent.controls.map((control) => JSON.stringify(control)).join(" | ") || "never"
      : "never";
    const contract = agent.clientContract;
    const input = yield* schemaCalculations.typeEffect(agent.input);
    const output = yield* schemaCalculations.typeEffect(agent.output);
    const resume = yield* resumeTypeEffect(contract, agent.workflow);
    const tools = yield* toolTypeEffect(contract);
    const state = yield* stateTypeEffect(contract);
    const events = yield* eventTypeEffect(contract);
    const scopes = yield* scopeTypeEffect(contract);
    const waiting = yield* waitingTypeEffect(contract);
    return `import("@relkit/client/react").ClientAgentContract<${input}, ${output}, ${controls}, ${agent.chat === null || agent.chat === undefined ? "false" : "true"}, ${resume}, ${tools}, ${state}, ${events}, ${scopes}, ${waiting}>`;
  });
}
const agentContractTypeOperation = makeGeneratorOperation(
  "agentContractType",
  agentContractTypeCore,
);
/** Renders the TypeScript client contract for an agent in an observed Effect.
 * @param agent - Public agent metadata and optional client contract.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(agentContractTypeEffect(agent));
 */
export const agentContractTypeEffect = agentContractTypeOperation.effect;
/** Renders the TypeScript client contract for an agent synchronously for existing callers.
 * @param agent - Public agent metadata and optional client contract.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example agentContractType(agent);
 */
export const agentContractType = agentContractTypeOperation.run;

/** Effect calculation reused within parent generator operations without starting another runtime. @internal */
export const agentContractCalculations = { type: agentContractTypeCore } as const;
