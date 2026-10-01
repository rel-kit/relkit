import { Effect } from "effect";
import { encodeErrorIdEffect, encodeMemberIdEffect } from "./discovery/source-id.js";
import { id, isRecord, refId } from "./normalize-utils.js";
import type { IdentityCandidate } from "./normalize-source-identities.types.js";

/**
 * Derives stable identities for unbound service function members.
 * @param candidates - Source-derived identity candidates accumulated for this execution.
 * @param identities - Original descriptor identities mapped to their stable replacements.
 * @returns A lazy effect that derives stable identities for unbound service function members; unexpected access failures remain defects.
 */
export const addServiceMemberIdentitiesEffect = Effect.fn("Compiler.addServiceMemberIdentities")(
  function* (candidates: readonly IdentityCandidate[], identities: Map<string, string>) {
    yield* Effect.forEach(
      candidates.filter(({ descriptor }) => descriptor.kind === "service"),
      (entry) =>
        Effect.gen(function* () {
          const serviceId = entry.resolved ?? (entry.inferred ? undefined : entry.descriptor.id);
          if (serviceId === undefined) return;
          const value = isRecord(entry.descriptor.value) ? entry.descriptor.value : {};
          const functions = isRecord(value.functions) ? value.functions : {};
          yield* Effect.forEach(
            Object.entries(functions),
            ([member, target]) =>
              Effect.gen(function* () {
                const targetId = id(isRecord(target) ? target.id : refId(target));
                if (targetId === undefined || !targetId.startsWith("unbound.")) return;
                const memberId = yield* encodeMemberIdEffect(serviceId, member);
                if (memberId !== undefined) identities.set(targetId, memberId);
              }),
            { discard: true },
          );
        }),
      { discard: true },
    );
  },
);

/**
 * Derives stable identities for source-local unbound errors.
 * @param candidates - Source-derived identity candidates accumulated for this execution.
 * @param identities - Original descriptor identities mapped to their stable replacements.
 * @returns A lazy effect that derives stable identities for source-local unbound errors; unexpected access failures remain defects.
 */
export const addNestedErrorIdentitiesEffect = Effect.fn("Compiler.addNestedErrorIdentities")(
  function* (candidates: readonly IdentityCandidate[], identities: Map<string, string>) {
    yield* Effect.forEach(
      candidates,
      ({ descriptor }) =>
        Effect.gen(function* () {
          const bindings = (descriptor.facts?.errorBindings ?? []).filter(
            ({ id: presence }) => presence === "omitted",
          );
          const errors = collect(descriptor.value, "error").filter(({ id }) =>
            id.startsWith("unbound."),
          );
          yield* Effect.forEach(
            bindings.entries(),
            ([index, binding]) =>
              Effect.gen(function* () {
                const error = errors[index];
                const errorId =
                  error === undefined
                    ? undefined
                    : yield* encodeErrorIdEffect(descriptor.source.file, binding.binding);
                if (error !== undefined && errorId !== undefined) identities.set(error.id, errorId);
              }),
            { discard: true },
          );
        }),
      { discard: true },
    );
  },
);

/**
 * Traverses nested metadata with ancestor cycle detection.
 * @param value - Declared metadata inspected without coercion.
 * @param kind - Descriptor or syntax category.
 * @param active - Ancestor identities owned by the current recursive branch.
 * @returns Nested metadata records visited once per ancestor path.
 */
function collect(value: unknown, kind: string, active = new Set<object>()): Record<string, any>[] {
  if (Array.isArray(value)) {
    if (active.has(value)) return [];
    active.add(value);
    const result = value.flatMap((child) => collect(child, kind, active));
    active.delete(value);
    return result;
  }
  if (!isRecord(value)) return [];
  if (active.has(value)) return [];
  active.add(value);
  const result = value.kind === kind ? [value] : [];
  for (const child of Object.values(value)) result.push(...collect(child, kind, active));
  active.delete(value);
  return result;
}
