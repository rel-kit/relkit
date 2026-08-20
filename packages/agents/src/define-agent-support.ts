import { deepFreeze } from "@zsys/contracts";
import { isToolRef, type ToolRefAny } from "@zsys/tools";
import type { PromptTemplate } from "./define-agent.js";

export function copyAgentInstructions(value: unknown): string | PromptTemplate {
  if (typeof value === "string") return requiredText(value, "Agent instructions");
  if (!isRecord(value)) throw new TypeError("Agent instructions must be text or a template");
  const template = requiredText(value.template, "Agent instructions template");
  const variables = copyVariables(value.variables);
  return deepFreeze({ template, ...(variables === undefined ? {} : { variables }) });
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
