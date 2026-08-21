import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";
import type { RegistryIssue, RuntimeManifestInput } from "./registry.js";

export function versionIssues(
  graph: ApplicationGraph,
  manifest: RuntimeManifestInput,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  if (graph.contractVersion !== GRAPH_VERSION) {
    issues.push({
      code: "ZSYS_GRAPH_VERSION_UNSUPPORTED",
      message: `Graph version ${String(graph.contractVersion)} is not supported.`,
    });
  }
  if (manifest.contractVersion !== MANIFEST_VERSION) {
    issues.push({
      code: "ZSYS_MANIFEST_VERSION_UNSUPPORTED",
      message: `Manifest version ${String(manifest.contractVersion)} is not supported.`,
    });
  }
  if (manifest.generatorVersion !== GENERATOR_VERSION) {
    issues.push({
      code: "ZSYS_MANIFEST_GENERATOR_UNSUPPORTED",
      message: `Manifest generator version ${String(manifest.generatorVersion)} is not supported.`,
    });
  }
  return issues;
}

export interface HandlerEntry {
  readonly id: unknown;
  readonly handler: unknown;
}

export function collectHandlerEntries(value: unknown, issues: RegistryIssue[]): HandlerEntry[] {
  if (value instanceof Map) return [...value.entries()].map(([id, handler]) => ({ id, handler }));
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (!Array.isArray(entry) || entry.length !== 2) {
        issues.push({
          code: "ZSYS_MANIFEST_HANDLER_INVALID",
          message: `Manifest handler entry ${String(index)} must contain an ID and handler.`,
        });
        return { id: `<entry:${index}>`, handler: undefined };
      }
      return { id: entry[0], handler: entry[1] };
    });
  }
  if (isRecord(value)) {
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      issues.push({
        code: "ZSYS_MANIFEST_HANDLER_INVALID",
        message: "Manifest handler IDs must be strings.",
      });
    }
    return Object.getOwnPropertyNames(value).map((id) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, id);
      return { id, handler: descriptor && "value" in descriptor ? descriptor.value : undefined };
    });
  }
  issues.push({
    code: "ZSYS_MANIFEST_HANDLER_INVALID",
    message: "Manifest functions must be a record, map, or entry list.",
  });
  return [];
}

export function validateHandlers(
  functionIds: readonly string[],
  entries: readonly HandlerEntry[],
  issues: RegistryIssue[],
): void {
  const expected = new Set(functionIds);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.id !== "string" || typeof entry.handler !== "function") {
      issues.push({
        code: "ZSYS_MANIFEST_HANDLER_INVALID",
        message: `Manifest handler for ${String(entry.id)} is not an executable function.`,
        ...(typeof entry.id === "string" ? { functionId: entry.id } : {}),
      });
      continue;
    }
    if (seen.has(entry.id)) {
      issues.push({
        code: "ZSYS_MANIFEST_HANDLER_DUPLICATE",
        message: `Manifest registers function "${entry.id}" more than once.`,
        functionId: entry.id,
      });
      continue;
    }
    seen.add(entry.id);
    if (!expected.has(entry.id)) {
      issues.push({
        code: "ZSYS_MANIFEST_HANDLER_EXTRA",
        message: `Manifest registers unknown function "${entry.id}".`,
        functionId: entry.id,
      });
    }
  }
  for (const id of functionIds) {
    if (!seen.has(id)) {
      issues.push({
        code: "ZSYS_MANIFEST_HANDLER_MISSING",
        message: `Manifest has no handler for function "${id}".`,
        functionId: id,
      });
    }
  }
  for (let index = 1; index < functionIds.length; index += 1) {
    if (functionIds[index] === functionIds[index - 1]) {
      issues.push({
        code: "ZSYS_GRAPH_FUNCTION_DUPLICATE",
        message: `Graph contains function "${functionIds[index]}" more than once.`,
        ...(functionIds[index] === undefined ? {} : { functionId: functionIds[index] }),
      });
    }
  }
}

export function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
