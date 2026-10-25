/**
 * Converts a validated RELKIT output schema to the native structured response
 * strategy, preserving schema failures and disabling native silent recovery.
 */
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import { providerStrategy, toolStrategy } from "langchain";
import { Effect } from "effect";
import { observeAgent } from "@relkit/agents/internal/agent-telemetry";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import type { NativeModel } from "./runtime-loop.types.js";
import { strictResponseSchema } from "./runtime-strict-response-schema.js";

/** Creates the native structured output strategy.
 * @param schema - Authored output validator.
 * @param model - Resolved model; explicit OpenAI Responses clients use native JSON schema.
 * @returns An Effect with a strategy or AgentInvocationFailure.
 * @example Effect.runSync(responseFormatEffect(output));
 */
export const responseFormatEffect = Effect.fn("Agents.runtime.responseFormat")(
  (schema: StandardSchemaV1, model?: NativeModel) =>
    Effect.try({
      try: () => {
        const projection = getJsonSchema(schema);
        if (!projection.ok) {
          throw new AgentRuntimeError(
            "RELKIT_SCHEMA_UNAVAILABLE",
            "Agent output schema is unavailable",
          );
        }
        const wrapped = {
          title: "relkit_output",
          type: "object" as const,
          properties: { value: projection.schema },
          required: ["value"],
          additionalProperties: false,
        };
        // Responses clients can drop string tool_choice; use their native schema channel.
        if (
          typeof model === "object" &&
          model !== null &&
          "useResponsesApi" in model &&
          model.useResponsesApi === true
        ) {
          const strictSchema = strictResponseSchema(wrapped);
          return providerStrategy({
            schema: { ...(strictSchema ?? wrapped), type: "object" },
            strict: strictSchema !== undefined,
          });
        }
        return toolStrategy(wrapped, { handleError: false });
      },
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.response-format", effect),
);
