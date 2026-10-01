import { Effect } from "effect";
import type {
  AgentClientContractMetadata,
  AgentScopeSource,
} from "./generate-agent-contract-fragments.types.js";
import { agentResumeCalculations } from "./generate-agent-resume.js";
import { schemaCalculations } from "./generate-schema.js";
import { recordCalculation } from "./generate-schema-render.js";

const dynamicType = 'import("@relkit/client/react").ClientAgentDynamic';

/** Deduplicates and sorts rendered type alternatives.
 * @param types - Type alternatives to combine.
 * @returns An Effect yielding a union or `never`; it has no expected failure.
 * @example Effect.runSync(agentTypeUnionEffect(["string", "number"]));
 */
export const agentTypeUnionEffect = Effect.fnUntraced(function* (types: readonly string[]) {
  return [...new Set(types)].sort().join(" | ") || "never";
});

/** Renders dynamic metadata or a JSON Schema type.
 * @param value - Agent contract metadata value.
 * @returns An Effect yielding the type expression; it has no expected failure.
 * @example Effect.runSync(metadataTypeEffect({ kind: "dynamic" }));
 */
export const metadataTypeEffect = Effect.fnUntraced(function* (value: unknown) {
  const record = yield* recordCalculation(value);
  return record?.kind === "dynamic" && Object.keys(record).length === 1
    ? dynamicType
    : yield* schemaCalculations.typeEffect(value);
});

/** Renders explicit waiting responses or workflow resume payloads.
 * @param contract - Optional agent client metadata.
 * @param workflow - Fallback workflow document.
 * @returns An Effect yielding a resume type; it has no expected failure.
 * @example Effect.runSync(resumeTypeEffect(undefined, { nodes: [] }));
 */
export const resumeTypeEffect = Effect.fnUntraced(function* (
  contract: AgentClientContractMetadata | undefined,
  workflow: unknown,
) {
  const types: string[] = [];
  for (const entry of contract?.waiting ?? [])
    types.push(yield* metadataTypeEffect(entry.response));
  return types.length > 0
    ? yield* agentTypeUnionEffect(types)
    : yield* agentResumeCalculations.type(workflow);
});

/** Renders static and dynamic agent tool variants.
 * @param contract - Optional agent client metadata.
 * @returns An Effect yielding a tool union; it has no expected failure.
 * @example Effect.runSync(toolTypeEffect(undefined));
 */
export const toolTypeEffect = Effect.fnUntraced(function* (
  contract: AgentClientContractMetadata | undefined,
) {
  const types: string[] = [];
  for (const tool of contract?.tools ?? []) {
    if ("kind" in tool) {
      types.push(dynamicType);
      continue;
    }
    const input = yield* metadataTypeEffect(tool.input);
    const output = yield* metadataTypeEffect(tool.output);
    types.push(
      `{ readonly kind: "tool"; readonly id: ${JSON.stringify(tool.id)}; readonly input: ${input}; readonly output: ${output} }`,
    );
  }
  return yield* agentTypeUnionEffect(types);
});

/** Renders agent state fields and optionality.
 * @param contract - Optional agent client metadata.
 * @returns An Effect yielding a state record type; it has no expected failure.
 * @example Effect.runSync(stateTypeEffect(undefined));
 */
export const stateTypeEffect = Effect.fnUntraced(function* (
  contract: AgentClientContractMetadata | undefined,
) {
  const fields: string[] = [];
  for (const field of contract?.state ?? []) {
    const type = yield* metadataTypeEffect(field.schema);
    fields.push(`${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${type}`);
  }
  return fields.length === 0
    ? "Readonly<Record<never, never>>"
    : `{ readonly ${fields.join("; readonly ")} }`;
});

/** Renders declared custom and dynamic agent events.
 * @param contract - Optional agent client metadata.
 * @returns An Effect yielding an event union; it has no expected failure.
 * @example Effect.runSync(eventTypeEffect(undefined));
 */
export const eventTypeEffect = Effect.fnUntraced(function* (
  contract: AgentClientContractMetadata | undefined,
) {
  const types: string[] = [];
  for (const event of contract?.events ?? []) {
    if ("kind" in event) {
      types.push(dynamicType);
      continue;
    }
    const data = yield* metadataTypeEffect(event.schema);
    types.push(
      `{ readonly kind: "custom"; readonly name: ${JSON.stringify(event.name)}; readonly data: ${data} }`,
    );
  }
  return yield* agentTypeUnionEffect(types);
});

/** Renders one static or dynamic agent scope.
 * @param scope - Scope discriminator and optional identifier.
 * @returns An Effect yielding a scope type; it has no expected failure.
 * @example Effect.runSync(scopeMemberEffect({ kind: "dynamic" }));
 */
export const scopeMemberEffect = Effect.fnUntraced(function* (scope: AgentScopeSource) {
  return scope.kind === "dynamic"
    ? dynamicType
    : `{ readonly kind: ${JSON.stringify(scope.kind)}; readonly id: ${JSON.stringify(scope.id)} }`;
});

/** Renders the union of agent scope types.
 * @param contract - Optional agent client metadata.
 * @returns An Effect yielding a scope union; it has no expected failure.
 * @example Effect.runSync(scopeTypeEffect(undefined));
 */
export const scopeTypeEffect = Effect.fnUntraced(function* (
  contract: AgentClientContractMetadata | undefined,
) {
  const types: string[] = [];
  for (const scope of contract?.scopes ?? [{ kind: "dynamic" }])
    types.push(yield* scopeMemberEffect(scope));
  return yield* agentTypeUnionEffect(types);
});

/** Renders waiting-node metadata for resumable agents.
 * @param contract - Optional agent client metadata.
 * @returns An Effect yielding a waiting union; it has no expected failure.
 * @example Effect.runSync(waitingTypeEffect(undefined));
 */
export const waitingTypeEffect = Effect.fnUntraced(function* (
  contract: AgentClientContractMetadata | undefined,
) {
  const types: string[] = [];
  for (const waiting of contract?.waiting ?? [])
    types.push(
      `{ readonly node: ${waiting.scope.kind === "dynamic" ? "string" : JSON.stringify(waiting.scope.id)}; readonly value?: unknown; readonly response: import("@relkit/contracts").JsonValue }`,
    );
  return yield* agentTypeUnionEffect(types);
});
