import { StateSchema, type AnyStateSchema } from "@langchain/langgraph";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import { AgentRuntimeError } from "./runtime-errors.js";

export function selectGraphState(
  state: AnyStateSchema,
  selection: StandardSchemaV1,
): AnyStateSchema {
  const projection = getJsonSchema(selection);
  const properties = projection.ok ? projection.schema.properties : undefined;
  if (!isRecord(properties)) {
    throw new AgentRuntimeError(
      "RELKIT_SCHEMA_UNAVAILABLE",
      "Graph state selection is unavailable",
    );
  }
  return new StateSchema(
    Object.fromEntries(
      Object.keys(properties).map((key) => {
        const field = state.fields[key];
        if (field === undefined) {
          throw new AgentRuntimeError(
            "RELKIT_SCHEMA_UNAVAILABLE",
            `Graph state field "${key}" is unavailable`,
          );
        }
        return [key, field];
      }),
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
