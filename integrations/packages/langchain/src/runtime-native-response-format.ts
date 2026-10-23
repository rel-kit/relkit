/**
 * Converts a validated RELKIT output schema to the native structured response
 * strategy, preserving schema failures and disabling native silent recovery.
 */
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import { toolStrategy } from "langchain";
import { Effect } from "effect";
import { observeAgent } from "@relkit/agents/internal/agent-telemetry";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";

/** Creates the native structured output strategy.
 * @param schema - Authored output validator.
 * @returns An Effect with a strategy or AgentInvocationFailure.
 * @example Effect.runSync(responseFormatEffect(output));
 */
export const responseFormatEffect = Effect.fn("Agents.runtime.responseFormat")(
  (schema: StandardSchemaV1) =>
    Effect.try({
      try: () => {
        const projection = getJsonSchema(schema);
        if (!projection.ok) {
          throw new AgentRuntimeError(
            "RELKIT_SCHEMA_UNAVAILABLE",
            "Agent output schema is unavailable",
          );
        }
        return toolStrategy(
          {
            title: "relkit_output",
            type: "object",
            properties: { value: projection.schema },
            required: ["value"],
            additionalProperties: false,
          },
          { handleError: false },
        );
      },
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.response-format", effect),
);
