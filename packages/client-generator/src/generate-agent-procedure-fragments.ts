import type { AgentSource } from "./generate-agent-procedure-fragments.types.js";
import { Effect } from "effect";
import {
  renderTypeObjectEffect,
  renderTypePropertyEffect,
  renderTypeUnionEffect,
} from "./generate-type-syntax.js";
/** Identity field included in each agent protocol request. */
export const expectedIdentity =
  'readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity';
/** Optional operation identifier included in agent run and control requests. */
export const operationId = 'readonly operationId?: import("@relkit/contracts").OperationId';
/** Joins rendered alternatives into a TypeScript union.
 * @param values - Already rendered type alternatives.
 * @returns An Effect yielding their union, or `never` for an empty list; it has no expected failure.
 * @example Effect.runSync(unionEffect(["string", "number"]));
 */
export const unionEffect = Effect.fnUntraced(function* (values: readonly string[]) {
  return yield* renderTypeUnionEffect(values);
});
/** Renders an oRPC procedure entry from its protocol types.
 * @param name - Stable procedure name.
 * @param input - Rendered input type.
 * @param output - Rendered output type.
 * @returns An Effect yielding a procedure declaration; it has no expected failure.
 * @example Effect.runSync(procedureEffect("relkit.agent.run", "unknown", "unknown"));
 */
export const procedureEffect = Effect.fnUntraced(function* (
  name: string,
  input: string,
  output: string,
) {
  return `  ${JSON.stringify(name)}: oc.input(schema<${input}>()).output(schema<${output}>()),`;
});
/** Selects the payload type for a declared control operation.
 * @param kind - Declared control name, including custom extensions.
 * @returns An Effect yielding the payload type; it has no expected failure.
 * @example Effect.runSync(controlPayloadEffect("stop"));
 */
export const controlPayloadEffect = Effect.fnUntraced(function* (kind: string) {
  if (kind === "steer" || kind === "follow-up") return "string";
  if (kind === "stop")
    return yield* renderTypeObjectEffect([
      yield* renderTypePropertyEffect("mode", '"graceful" | "immediate"', { optional: true }),
    ]);
  if (kind === "approve")
    return yield* renderTypeObjectEffect([
      yield* renderTypePropertyEffect("approvalId", "string"),
      yield* renderTypePropertyEffect("decision", '"approve" | "deny"'),
    ]);
  return "unknown";
});
/** Renders the valid control request variants for one agent.
 * @param agent - Agent whose declared controls are rendered.
 * @returns An Effect yielding ordered control input types; it has no expected failure.
 * @example Effect.runSync(controlInputsEffect({ id: "assistant", input: {}, controls: ["stop"] }));
 */
export const controlInputsEffect = Effect.fnUntraced(function* (agent: AgentSource) {
  if (!Array.isArray(agent.controls)) return [];
  const inputs: string[] = [];
  for (const kind of agent.controls) {
    if (typeof kind !== "string") continue;
    const payload = yield* controlPayloadEffect(kind);
    inputs.push(
      yield* renderTypeObjectEffect([
        yield* renderTypePropertyEffect("agentId", JSON.stringify(agent.id)),
        yield* renderTypePropertyEffect("threadId", "string"),
        operationId,
        yield* renderTypePropertyEffect("requestDigest", "string", { optional: true }),
        yield* renderTypePropertyEffect("kind", JSON.stringify(kind)),
        yield* renderTypePropertyEffect("payload", payload),
        expectedIdentity,
      ]),
    );
  }
  return inputs;
});
/** Builds the fixed agent protocol types within the parent generation Effect.
 * @returns An Effect yielding thread, receipt, and control declarations.
 * @example Effect.runSync(agentProtocolTypesEffect());
 */
export const agentProtocolTypesEffect = Effect.fnUntraced(function* () {
  const property = renderTypePropertyEffect;
  const object = renderTypeObjectEffect;
  const threadList = yield* object([
    yield* property("threads", 'readonly import("@relkit/contracts").ThreadListItem[]'),
  ]);
  const runReceipt = yield* renderTypeUnionEffect([
    yield* object([
      yield* property("operationId", 'import("@relkit/contracts").OperationId'),
      yield* property("threadId", "string"),
      yield* property("runId", "string"),
      yield* property("status", '"accepted"'),
      yield* property("duplicate", "boolean"),
    ]),
    yield* object([
      yield* property("operationId", 'import("@relkit/contracts").OperationId'),
      yield* property("threadId", "string"),
      yield* property("interruptedRunId", "string"),
      yield* property("runId", "string"),
      yield* property("interruptSetDigest", "string"),
      yield* property("waitingRevision", "string", { optional: true }),
      yield* property("duplicate", "boolean"),
    ]),
  ]);
  const controlReceipt = yield* object([
    yield* property("operationId", 'import("@relkit/contracts").OperationId'),
    yield* property("threadId", "string"),
    yield* property("runId", "string"),
    yield* property("status", 'import("@relkit/contracts").ControlStatus'),
    yield* property("effect", 'import("@relkit/contracts").ControlEffectOutcome'),
    yield* property("duplicate", "boolean"),
  ]);
  const receiptFields = [
    yield* property("threadId", "string", { optional: true }),
    yield* property("runId", "string", { optional: true }),
    yield* property("operationId", 'import("@relkit/contracts").OperationId'),
    yield* property("kind", '"agent-run" | "agent-control" | "continuation"', {
      optional: true,
    }),
    yield* property("requestDigest", "string"),
    expectedIdentity,
  ];
  const receiptLookup = `import("@relkit/contracts").ReceiptLookup<${yield* object([
    yield* property("threadId", "string"),
  ])}>`;
  return { threadList, runReceipt, controlReceipt, receiptFields, receiptLookup };
});
