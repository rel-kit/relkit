import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { DecisionType, HitlRequest, ReviewConfig } from "./native-agent-interruption-schema.types.js";

export type * from "./native-agent-interruption-schema.types.js";

/** Constructs the exact response schema for pending reviews.
 * @param configs - Review policies in action order.
 * @returns An Effect with a JSON schema and no typed failure.
 * @example Effect.runSync(hitlResponseSchemaEffect(configs));
 */
export const hitlResponseSchemaEffect = Effect.fn("Agents.nativeHitl.responseSchema")(
  (configs: readonly ReviewConfig[]) => Effect.sync((): JsonValue => ({
    type: "object",
    properties: {
      decisions: {
        type: "array",
        prefixItems: configs.map(({ actionName, allowedDecisions, argsSchema }) => ({
          oneOf: allowedDecisions.map((decision) =>
            decisionSchema(decision, actionName, argsSchema),
          ),
        })),
        items: false,
        minItems: configs.length,
        maxItems: configs.length,
      },
    },
    required: ["decisions"],
    additionalProperties: false,
  })),
  (effect) => observeAgent("native-hitl.response-schema", effect),
);

/** Constructs the response schema for existing synchronous callers.
 * @param configs - Review policies in action order.
 * @returns A JSON schema.
 * @example const schema = hitlResponseSchema(configs);
 */
export function hitlResponseSchema(configs: readonly ReviewConfig[]): JsonValue {
  return Effect.runSync(hitlResponseSchemaEffect(configs));
}

/** Validates the native human review request shape.
 * @param value - Candidate request.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isHitlRequestEffect(value));
 */
export const isHitlRequestEffect = Effect.fn("Agents.nativeHitl.isRequest")(
  (value: unknown) => Effect.sync(() => (
    recordShape(value) &&
    Array.isArray(value.actionRequests) &&
    value.actionRequests.every(recordShape) &&
    Array.isArray(value.reviewConfigs) &&
    value.actionRequests.length === value.reviewConfigs.length &&
    value.reviewConfigs.every(
      (config) =>
        recordShape(config) &&
        typeof config.actionName === "string" &&
        Array.isArray(config.allowedDecisions) &&
        config.allowedDecisions.length > 0 &&
        config.allowedDecisions.every(decisionShape),
    )
  )),
  (effect) => observeAgent("native-hitl.is-request", effect),
);

/** Checks a native human review request for existing synchronous callers.
 * @param value - Candidate request.
 * @returns Whether the value is a review request.
 * @example if (isHitlRequest(value)) handle(value);
 */
export function isHitlRequest(value: unknown): value is HitlRequest {
  return Effect.runSync(isHitlRequestEffect(value));
}

/** Projects a review request to public action fields.
 * @param value - Validated review request.
 * @returns An Effect with the public request and no typed failure.
 * @example Effect.runSync(publicHitlRequestEffect(request));
 */
export const publicHitlRequestEffect = Effect.fn("Agents.nativeHitl.publicRequest")(
  (value: HitlRequest) => Effect.sync((): HitlRequest => ({
    actionRequests: value.actionRequests.map((action) => ({
      name: action.name,
      args: action.args,
      ...(typeof action.description === "string" ? { description: action.description } : {}),
    })),
    reviewConfigs: value.reviewConfigs.map((config) => ({
      actionName: config.actionName,
      allowedDecisions: [...config.allowedDecisions],
      ...(config.argsSchema === undefined ? {} : { argsSchema: config.argsSchema }),
    })),
  })),
  (effect) => observeAgent("native-hitl.public-request", effect),
);

/** Projects a review request for existing synchronous callers.
 * @param value - Validated review request.
 * @returns Public action and review fields.
 * @example const request = publicHitlRequest(nativeRequest);
 */
export function publicHitlRequest(value: HitlRequest): HitlRequest {
  return Effect.runSync(publicHitlRequestEffect(value));
}

/** Checks one native human decision label.
 * @param value - Candidate label.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isDecisionEffect("approve"));
 */
export const isDecisionEffect = Effect.fn("Agents.nativeHitl.isDecision")(
  (value: unknown) => Effect.sync(() => decisionShape(value)),
  (effect) => observeAgent("native-hitl.is-decision", effect),
);

/** Checks a decision label for existing synchronous callers.
 * @param value - Candidate label.
 * @returns Whether the value is an allowed decision kind.
 * @example if (isDecision(value)) useDecision(value);
 */
export function isDecision(value: unknown): value is DecisionType {
  return Effect.runSync(isDecisionEffect(value));
}

function decisionShape(value: unknown): value is DecisionType {
  return value === "approve" || value === "edit" || value === "reject";
}

/** Checks a non-null, non-array record.
 * @param value - Candidate record.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isRecordEffect({ name: "tool" }));
 */
export const isRecordEffect = Effect.fn("Agents.nativeHitl.isRecord")(
  (value: unknown) => Effect.sync(() => recordShape(value)),
  (effect) => observeAgent("native-hitl.is-record", effect),
);

/** Checks a record for existing synchronous callers.
 * @param value - Candidate record.
 * @returns Whether the value is a non-null object.
 * @example if (isRecord(value)) read(value.name);
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Effect.runSync(isRecordEffect(value));
}

function recordShape(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decisionSchema(type: DecisionType, actionName: string, argsSchema?: JsonValue): JsonValue {
  const base = { type: "object", additionalProperties: false } as const;
  if (type === "approve") {
    return { ...base, properties: { type: { const: type } }, required: ["type"] };
  }
  if (type === "reject") {
    return {
      ...base,
      properties: { type: { const: type }, message: { type: "string" } },
      required: ["type"],
    };
  }
  return {
    ...base,
    properties: {
      type: { const: type },
      editedAction: {
        type: "object",
        properties: { name: { const: actionName }, args: argsSchema ?? { type: "object" } },
        required: ["name", "args"],
        additionalProperties: false,
      },
    },
    required: ["type", "editedAction"],
  };
}
