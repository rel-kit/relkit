import type { JsonValue } from "@relkit/contracts";

export type DecisionType = "approve" | "edit" | "reject";

export interface ReviewConfig {
  readonly actionName: string;
  readonly allowedDecisions: readonly DecisionType[];
  readonly argsSchema?: JsonValue;
}

export interface HitlRequest {
  readonly actionRequests: readonly Record<string, unknown>[];
  readonly reviewConfigs: readonly ReviewConfig[];
}

export function hitlResponseSchema(configs: readonly ReviewConfig[]): JsonValue {
  return {
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
  };
}

export function isHitlRequest(value: unknown): value is HitlRequest {
  return (
    isRecord(value) &&
    Array.isArray(value.actionRequests) &&
    value.actionRequests.every(isRecord) &&
    Array.isArray(value.reviewConfigs) &&
    value.actionRequests.length === value.reviewConfigs.length &&
    value.reviewConfigs.every(
      (config) =>
        isRecord(config) &&
        typeof config.actionName === "string" &&
        Array.isArray(config.allowedDecisions) &&
        config.allowedDecisions.length > 0 &&
        config.allowedDecisions.every(isDecision),
    )
  );
}

export function publicHitlRequest(value: HitlRequest): HitlRequest {
  return {
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
  };
}

export function isDecision(value: unknown): value is DecisionType {
  return value === "approve" || value === "edit" || value === "reject";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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
