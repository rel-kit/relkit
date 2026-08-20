import { normalizeSourcePath } from "@zsys/contracts";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

export function eventListenerExecutableExpression(
  descriptor: NormalizedDescriptor,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
  property: "handler" | "target",
): string | undefined {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const generated = isRecord(value.generated) ? value.generated : {};
  const reference = descriptor.reference;
  if (
    generated.generatedBy !== "event-listener" ||
    reference?.kind !== "event-trigger" ||
    reference.descriptorId !== generated.listenerId
  )
    return undefined;
  let module: string;
  try {
    module = normalizeSourcePath(reference.module, input.projectRoot);
  } catch {
    return undefined;
  }
  const binding = bindings.get(module);
  if (binding === undefined) return undefined;
  const listener = `${binding.alias}[${JSON.stringify(reference.exportName)}]`;
  if (property === "handler") return `${listener}.target.handler`;
  const contracts = eventContracts(generated.listenerId, input, bindings);
  return `__zsys_createEventListenerTarget(${listener}, [${contracts.join(", ")}], ${JSON.stringify(generated.functionId)})`;
}

function eventContracts(
  listenerId: string,
  input: ManifestGenerationInput,
  bindings: ReadonlyMap<string, ImportBinding>,
): readonly string[] {
  const listener = input.descriptors.find(
    (entry) => entry.kind === "event-trigger" && entry.id === listenerId,
  );
  const selector = isRecord(listener?.value) ? listener.value.selector : undefined;
  return input.descriptors
    .filter((entry) => entry.kind === "event" && selects(selector, entry.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((entry) => {
      const reference = entry.reference;
      if (reference === undefined) return [];
      let module: string;
      try {
        module = normalizeSourcePath(reference.module, input.projectRoot);
      } catch {
        return [];
      }
      const contract = bindings.get(module);
      return contract === undefined
        ? []
        : [`${contract.alias}[${JSON.stringify(reference.exportName)}]`];
    });
}

function selects(selector: unknown, eventId: string): boolean {
  if (!isRecord(selector)) return false;
  if (selector.kind === "all") return true;
  if (selector.kind === "match" && typeof selector.pattern === "string") {
    return matches(eventId, selector.pattern);
  }
  if (selector.kind === "single" && isRecord(selector.event)) {
    return selector.event.eventId === eventId;
  }
  return (
    selector.kind === "anyOf" &&
    Array.isArray(selector.events) &&
    selector.events.some((entry) => isRecord(entry) && entry.eventId === eventId)
  );
}

function matches(eventId: string, pattern: string): boolean {
  return matchSegments(pattern.split("."), eventId.split("."));
}

function matchSegments(pattern: readonly string[], value: readonly string[]): boolean {
  if (pattern.length === 0) return value.length === 0;
  if (pattern[0] === "**") {
    return (
      matchSegments(pattern.slice(1), value) ||
      (value.length > 0 && matchSegments(pattern, value.slice(1)))
    );
  }
  return (
    value.length > 0 &&
    (pattern[0] === "*" || pattern[0] === value[0]) &&
    matchSegments(pattern.slice(1), value.slice(1))
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
