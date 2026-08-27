import { deepFreeze } from "@relkit/contracts";
import { isToolRef, type ToolRefAny } from "@relkit/tools";
import type { AgentInstructions, PromptInstructions, PromptTemplate } from "./define-agent.js";

export function copyAgentInstructions(value: unknown): AgentInstructions {
  if (typeof value === "string") return requiredText(value, "Agent instructions");
  if (!isRecord(value)) throw new TypeError("Agent instructions must be text or a template");
  if (value.kind === "prompt") return copyPrompt(value);
  const template = requiredText(value.template, "Agent instructions template");
  const variables = copyVariables(value.variables);
  return deepFreeze({ template, ...(variables === undefined ? {} : { variables }) });
}

export function isAgentInstructions(value: unknown): value is AgentInstructions {
  if (typeof value === "string") return value.trim() !== "";
  if (isRecord(value) && value.kind === "prompt") {
    const prompt = value.value;
    return (
      (typeof prompt === "string" && prompt.trim() !== "") ||
      (Array.isArray(prompt) &&
        prompt.length > 0 &&
        prompt.every((entry) => typeof entry === "string" && entry.trim() !== ""))
    );
  }
  if (!isRecord(value) || typeof value.template !== "string" || value.template.trim() === "")
    return false;
  return (
    value.variables === undefined ||
    (Array.isArray(value.variables) &&
      value.variables.every((entry) => typeof entry === "string" && entry.trim() !== ""))
  );
}

function copyPrompt(value: Record<PropertyKey, unknown>): PromptInstructions {
  if (
    typeof value.id !== "string" ||
    !isRecord(value.ref) ||
    value.ref.kind !== "prompt" ||
    value.ref.id !== value.id
  ) {
    throw new TypeError("Agent prompt instructions must be a prompt descriptor");
  }
  const prompt = value.value;
  const entries = typeof prompt === "string" ? [prompt] : prompt;
  if (
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.some((entry) => typeof entry !== "string" || entry.trim() === "")
  ) {
    throw new TypeError("Agent prompt instructions must contain nonempty text");
  }
  return value as unknown as PromptInstructions;
}

export function copyAgentTools(value: unknown): readonly ToolRefAny[] {
  if (!Array.isArray(value)) throw new TypeError("Agent tools must be an array");
  const ids = new Set<string>();
  return Object.freeze(
    value.map((tool, index) => {
      if (!isToolRef(tool)) throw new TypeError(`Agent tool at index ${index} must be a tool ref`);
      const id = tool.ref.id;
      if (ids.has(id)) throw new TypeError(`Duplicate agent tool "${id}"`);
      ids.add(id);
      return Object.freeze({ ref: Object.freeze({ kind: "tool" as const, id }) });
    }),
  );
}

function copyVariables(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("template.variables must be an array");
  const variables = value.map((entry) => requiredText(entry, "template variable"));
  if (new Set(variables).size !== variables.length) {
    throw new TypeError("template.variables must be unique");
  }
  return Object.freeze(variables);
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
