/** Helpers of the shared agent loop: instructions, input text, the output tool and output checks. */
import { getJsonSchema, validate } from "../schema/index.js";
import type { StandardSchemaV1 } from "../schema/index.js";
import type { AgentToolDefinition } from "./adapter.types.js";

/** Model-facing name of the tool a model calls to return the agent's final output. */
export const OUTPUT_TOOL_NAME = "relkit_output";

/** Error carrying a stable code from an adapter run. @experimental */
export class AgentAdapterError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentAdapterError";
    this.code = code;
  }
}

/**
 * Renders authored instructions as one system message.
 * @param instructions - String, prompt template or prompt reference.
 * @returns System message text.
 */
export function instructionText(instructions: unknown): string {
  if (typeof instructions === "string") return instructions;
  if (instructions !== null && typeof instructions === "object") {
    const value = instructions as { readonly template?: unknown; readonly value?: unknown };
    if (typeof value.template === "string") return value.template;
    if (typeof value.value === "string") return value.value;
    if (Array.isArray(value.value)) return value.value.join("\n");
  }
  return "";
}

/**
 * Renders run input as a user message.
 * @param input - Validated agent input.
 * @returns Message text.
 */
export function inputText(input: unknown): string {
  return typeof input === "string" ? input : JSON.stringify(input);
}

/**
 * Builds the output tool definition from the agent's output schema.
 * @param output - Output schema.
 * @returns Tool definition the model calls with `{ value }`.
 */
export function outputTool(output: StandardSchemaV1): AgentToolDefinition {
  const projected = getJsonSchema(output, { direction: "output" });
  return Object.freeze({
    id: OUTPUT_TOOL_NAME,
    name: OUTPUT_TOOL_NAME,
    description: "Return the final answer.",
    inputSchema: {
      type: "object",
      properties: { value: projected.ok ? projected.schema : {} },
      required: ["value"],
    },
    requiresApproval: false,
  });
}

/**
 * Validates a final output, accepting raw text, JSON text or the output tool's `value`.
 * @param output - Output schema.
 * @param candidates - Values to try in order.
 * @returns The first valid output.
 * @throws AgentAdapterError with `RELKIT_AGENT_OUTPUT_VALIDATION`.
 */
export async function validOutput(
  output: StandardSchemaV1,
  candidates: readonly unknown[],
): Promise<unknown> {
  for (const candidate of candidates) {
    const result = await validate(output, candidate as never);
    if (!("issues" in result) || result.issues === undefined) {
      return (result as { readonly value: unknown }).value;
    }
  }
  throw new AgentAdapterError("RELKIT_AGENT_OUTPUT_VALIDATION", "Agent output is invalid.");
}

/**
 * Parses model text as JSON when possible.
 * @param text - Model text.
 * @returns Candidate outputs: the text itself and its JSON value.
 */
export function textCandidates(text: string): readonly unknown[] {
  try {
    return [JSON.parse(text), text];
  } catch {
    return [text];
  }
}
