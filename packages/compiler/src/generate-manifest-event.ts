import { SourceLocationError } from "@relkit/contracts";
import { normalizeSourcePath } from "@relkit/contracts";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import { isRecord, type ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

/**
 * Renders a target expression for an event-only function.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns The event-only function target expression, or undefined.
 */
export function functionEventTargetExpression(
  descriptor: NormalizedDescriptor,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): string | undefined {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const publishes = Array.isArray(value.publishes)
    ? value.publishes.filter((eventId): eventId is string => typeof eventId === "string")
    : [];
  if (value.invocationMode !== "event-only" && publishes.length === 0) return undefined;
  const target = descriptorExpression(descriptor, bindings, input);
  const consumed =
    value.invocationMode === "event-only" && typeof value.event === "string"
      ? eventExpression(value.event, bindings, input)
      : "undefined";
  const contracts = publishes.map((eventId) => eventExpression(eventId, bindings, input));
  return target === undefined ||
    consumed === undefined ||
    contracts.some((entry) => entry === undefined)
    ? undefined
    : `__relkit_bindFunctionEvents(${target}, ${consumed}, [${contracts.join(", ")}])`;
}

/**
 * Renders a source-bound event descriptor expression.
 * @param eventId - Stable ID of the owning event.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns The source-bound event expression, or undefined.
 */
function eventExpression(
  eventId: string,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): string | undefined {
  const event = input.descriptors.find((entry) => entry.kind === "event" && entry.id === eventId);
  return event === undefined ? undefined : descriptorExpression(event, bindings, input);
}

/**
 * Renders one source-bound descriptor expression.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns The source-bound descriptor expression, or undefined.
 */
function descriptorExpression(
  descriptor: NormalizedDescriptor,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): string | undefined {
  const reference = descriptor.reference;
  if (
    reference === undefined ||
    reference.kind !== descriptor.kind ||
    reference.descriptorId !== descriptor.id
  )
    return undefined;
  try {
    const binding = bindings.get(normalizeSourcePath(reference.module, input.projectRoot));
    return binding === undefined
      ? undefined
      : `${binding.alias}[${JSON.stringify(reference.exportName)}]`;
  } catch (error) {
    if (!(error instanceof SourceLocationError)) throw error;
    return undefined;
  }
}
