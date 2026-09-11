import { schemaType } from "./generate-schema.js";

export function agentResumeType(workflow: unknown): string {
  const types = new Set<string>();
  collectResumeTypes(workflow, types);
  return [...types].sort().join(" | ") || "never";
}

function collectResumeTypes(workflow: unknown, types: Set<string>): void {
  if (!isRecord(workflow) || !Array.isArray(workflow.nodes)) return;
  for (const node of workflow.nodes) {
    if (!isRecord(node)) continue;
    if (node.resume !== undefined) types.add(schemaType(node.resume));
    collectResumeTypes(node.workflow, types);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
