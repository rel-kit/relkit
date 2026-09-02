import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { isEventFunctionDescriptor } from "@relkit/events";
import { getDescriptorIdentity } from "@relkit/invocation";
import type { RegistryIssue, RuntimeManifestInput } from "./registry.js";
import type { InvocationTarget } from "./invoke-types.js";
import { artifactIssues } from "./registry-artifacts.js";

export function versionIssues(
  graph: ApplicationGraph,
  manifest: RuntimeManifestInput,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  if (graph.contractVersion !== GRAPH_VERSION) {
    issues.push({
      code: "RELKIT_GRAPH_VERSION_UNSUPPORTED",
      message: `Graph contract version ${String(graph.contractVersion)} is unsupported; expected ${GRAPH_VERSION}. Rebuild with \`relkit build\`.`,
    });
  }
  if (manifest.contractVersion !== MANIFEST_VERSION) {
    issues.push({
      code: "RELKIT_MANIFEST_VERSION_UNSUPPORTED",
      message: `Runtime manifest version ${String(manifest.contractVersion)} is unsupported; expected ${MANIFEST_VERSION}. Rebuild with \`relkit build\`.`,
    });
  }
  if (manifest.generatorVersion !== GENERATOR_VERSION) {
    issues.push({
      code: "RELKIT_MANIFEST_GENERATOR_UNSUPPORTED",
      message: `Runtime manifest generator version ${String(manifest.generatorVersion)} is unsupported; expected ${GENERATOR_VERSION}. Rebuild with \`relkit build\`.`,
    });
  }
  issues.push(...artifactIssues(manifest));
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
          code: "RELKIT_MANIFEST_HANDLER_INVALID",
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
        code: "RELKIT_MANIFEST_HANDLER_INVALID",
        message: "Manifest handler IDs must be strings.",
      });
    }
    return Object.getOwnPropertyNames(value).map((id) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, id);
      return { id, handler: descriptor && "value" in descriptor ? descriptor.value : undefined };
    });
  }
  issues.push({
    code: "RELKIT_MANIFEST_HANDLER_INVALID",
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
        code: "RELKIT_MANIFEST_HANDLER_INVALID",
        message: `Manifest handler for ${String(entry.id)} is not an executable function.`,
        ...(typeof entry.id === "string" ? { functionId: entry.id } : {}),
      });
      continue;
    }
    if (seen.has(entry.id)) {
      issues.push({
        code: "RELKIT_MANIFEST_HANDLER_DUPLICATE",
        message: `Manifest registers function "${entry.id}" more than once.`,
        functionId: entry.id,
      });
      continue;
    }
    seen.add(entry.id);
    if (!expected.has(entry.id)) {
      issues.push({
        code: "RELKIT_MANIFEST_HANDLER_EXTRA",
        message: `Manifest registers unknown function "${entry.id}".`,
        functionId: entry.id,
      });
    }
  }
  for (const id of functionIds) {
    if (!seen.has(id)) {
      issues.push({
        code: "RELKIT_MANIFEST_HANDLER_MISSING",
        message: `Manifest has no handler for function "${id}".`,
        functionId: id,
      });
    }
  }
  for (let index = 1; index < functionIds.length; index += 1) {
    if (functionIds[index] === functionIds[index - 1]) {
      issues.push({
        code: "RELKIT_GRAPH_FUNCTION_DUPLICATE",
        message: `Graph contains function "${functionIds[index]}" more than once.`,
        ...(functionIds[index] === undefined ? {} : { functionId: functionIds[index] }),
      });
    }
  }
}

export function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validateTargets(
  graph: ApplicationGraph,
  candidates: Readonly<Record<string, unknown>> | undefined,
  issues: RegistryIssue[],
): Readonly<Record<string, InvocationTarget>> {
  const targets: Record<string, InvocationTarget> = Object.create(null);
  for (const node of graph.nodes) {
    if (node.kind !== "function") continue;
    const target = candidates?.[node.id];
    const publications = graph.edges
      .filter((edge) => edge.kind === "publishes-event" && edge.from === node.id)
      .map((edge) => edge.to)
      .sort();
    if (target === undefined && node.invocationMode !== "event-only" && publications.length === 0)
      continue;
    if (
      !isRecord(target) ||
      getDescriptorIdentity(target) !== node.id ||
      typeof target.handler !== "function" ||
      (target.invocationMode ?? "callable") !== node.invocationMode ||
      (node.invocationMode === "event-only" &&
        (!isEventFunctionDescriptor(target) ||
          !graph.nodes.some(
            (trigger) =>
              trigger.kind === "trigger" &&
              trigger.triggerType === "event" &&
              trigger.targetFunctionId === node.id &&
              (trigger.config as Record<string, unknown>).eventId === target.event,
          ))) ||
      !isRecord(target.input) ||
      !isRecord(target.output) ||
      JSON.stringify(
        Object.keys(isRecord(target.publications) ? target.publications : {}).sort(),
      ) !== JSON.stringify(publications)
    ) {
      issues.push({
        code: "RELKIT_MANIFEST_HANDLER_INVALID",
        message: `Function "${node.id}" requires a ${node.invocationMode} executable target.`,
        functionId: node.id,
      });
    } else {
      targets[node.id] = target as unknown as InvocationTarget;
    }
  }
  return Object.freeze(targets);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
