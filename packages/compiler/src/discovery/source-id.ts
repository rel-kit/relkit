import { normalizeIdEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { observeCompiler } from "../observability.js";
import { runDiscoverySync } from "./discovery-sync.js";
import type { SourceFactoryKind } from "./source-facts-types.js";
import { finishEffect, join, kebab, sourcePartsEffect } from "./source-id-helpers.js";
import { encodeRouteIdEffect } from "./source-id-route.js";
import type { ExportIdInput, SourceIdInput } from "./source-id.types.js";

export { encodeRouteId, encodeRouteIdEffect } from "./source-id-route.js";
export type { ExportIdInput, SourceIdInput } from "./source-id.types.js";

/**
 * Derives the normalized source hierarchy after conventional path stripping.
 * @param source - Source provenance path.
 * @param kind - Descriptor kind selecting stripping rules.
 * @param projectRoot - Optional absolute root for absolute paths.
 * @returns A lazy effect yielding the lexical source hierarchy or undefined.
 */
export const encodeSourceHierarchyEffect = Effect.fn("discovery.identity.hierarchy")(
  function* (source: string, kind: SourceFactoryKind, projectRoot?: string) {
    return join(yield* sourcePartsEffect(source, kind, projectRoot));
  },
  (effect) => observeCompiler("discovery", "encodeSourceHierarchy", effect, () => ({}), false),
);

/**
 * Encodes a named or default export using source and binding provenance.
 * @param input - Export identity provenance and optional explicit ID.
 * @returns A lazy effect yielding the identity or undefined; malformed explicit/derived IDs fail with StableIdError.
 */
export const encodeExportIdEffect = Effect.fn("discovery.identity.export")(
  function* (input: ExportIdInput) {
    if (input.explicitId !== undefined) return yield* normalizeIdEffect(input.explicitId);
    const parts = yield* sourcePartsEffect(input.source, input.kind, input.projectRoot);
    if (input.exportKind === "default") return yield* finishEffect(parts);
    const name = kebab(input.binding ?? input.exportFact?.binding);
    if (name === undefined) return undefined;
    return yield* finishEffect(parts.length === 0 ? [name] : [...parts.slice(0, -1), name]);
  },
  (effect) => observeCompiler("discovery", "encodeExportId", effect, () => ({}), false),
);

/**
 * Encodes a source-local error while retaining the declared binding spelling.
 * @param source - Source provenance path.
 * @param binding - Error declaration's binding name.
 * @param explicitId - Optional authoritative stable identity.
 * @param projectRoot - Optional absolute root for absolute source paths.
 * @returns A lazy effect yielding identity or undefined; invalid IDs fail with StableIdError.
 */
export const encodeErrorIdEffect = Effect.fn("discovery.identity.error")(
  function* (source: string, binding: string, explicitId?: unknown, projectRoot?: string) {
    if (explicitId !== undefined) return yield* normalizeIdEffect(explicitId);
    if (binding.trim() === "") return undefined;
    return yield* finishEffect([
      ...(yield* sourcePartsEffect(source, "error", projectRoot)),
      binding,
    ]);
  },
  (effect, source, binding, explicitId?: unknown, projectRoot?: string) =>
    observeCompiler("discovery", "encodeErrorId", effect, () => ({}), false),
);

/**
 * Encodes a service member using the service's already-resolved identity.
 * @param serviceId - Authoritative service identity.
 * @param member - Declared service member spelling.
 * @param explicitId - Optional authoritative member identity.
 * @returns A lazy effect yielding identity or undefined; invalid IDs fail with StableIdError.
 */
export const encodeMemberIdEffect = Effect.fn("discovery.identity.member")(
  function* (serviceId: string, member: string, explicitId?: unknown) {
    if (explicitId !== undefined) return yield* normalizeIdEffect(explicitId);
    const service = yield* normalizeIdEffect(serviceId);
    const name = kebab(member);
    return name === undefined ? undefined : yield* finishEffect([service, name]);
  },
  (effect) => observeCompiler("discovery", "encodeMemberId", effect, () => ({}), false),
);

/**
 * Selects explicit identity first, then route, member, error, or export derivation.
 * @param input - Descriptor provenance for selecting an identity strategy.
 * @returns A lazy effect yielding identity or undefined; invalid IDs fail with StableIdError.
 */
export const encodeSourceIdEffect = Effect.fn("discovery.identity.source")(
  function* (input: SourceIdInput) {
    if (input.explicitId !== undefined) return yield* normalizeIdEffect(input.explicitId);
    if (input.kind === "route") {
      if (input.method === undefined || input.path === undefined) return undefined;
      return yield* encodeRouteIdEffect(input.method, input.path);
    }
    if (input.serviceId !== undefined && input.member !== undefined)
      return yield* encodeMemberIdEffect(input.serviceId, input.member);
    if (input.kind === "error" && input.binding !== undefined)
      return yield* encodeErrorIdEffect(input.source, input.binding, undefined, input.projectRoot);
    if (input.exportKind === undefined) return undefined;
    return yield* encodeExportIdEffect({
      source: input.source,
      kind: input.kind,
      exportName: input.exportName ?? "",
      exportKind: input.exportKind,
      ...(input.binding === undefined ? {} : { binding: input.binding }),
      ...(input.projectRoot === undefined ? {} : { projectRoot: input.projectRoot }),
    });
  },
  (effect) => observeCompiler("discovery", "encodeSourceId", effect, () => ({}), false),
);

/**
 * Synchronous source hierarchy compatibility boundary.
 * @param source - Source provenance path.
 * @param kind - Descriptor kind.
 * @param projectRoot - Optional absolute root.
 * @returns Lexical source hierarchy or undefined.
 */
export function encodeSourceHierarchy(
  source: string,
  kind: SourceFactoryKind,
  projectRoot?: string,
): string | undefined {
  return runDiscoverySync(encodeSourceHierarchyEffect(source, kind, projectRoot));
}

/**
 * Synchronous export identity compatibility boundary.
 * @param input - Export provenance and optional authoritative identity.
 * @returns Stable identity or undefined for insufficient syntax.
 * @throws StableIdError for invalid explicit or derived IDs.
 */
export function encodeExportId(input: ExportIdInput): string | undefined {
  return runDiscoverySync(encodeExportIdEffect(input));
}

/**
 * Synchronous source-local error identity compatibility boundary.
 * @param source - Source provenance path.
 * @param binding - Declared error binding.
 * @param explicitId - Optional authoritative identity.
 * @param projectRoot - Optional absolute root.
 * @returns Stable error identity or undefined.
 * @throws StableIdError for invalid explicit or derived IDs.
 */
export function encodeErrorId(
  source: string,
  binding: string,
  explicitId?: unknown,
  projectRoot?: string,
): string | undefined {
  return runDiscoverySync(encodeErrorIdEffect(source, binding, explicitId, projectRoot));
}

/**
 * Synchronous service member identity compatibility boundary.
 * @param serviceId - Authoritative service identity.
 * @param member - Declared member spelling.
 * @param explicitId - Optional authoritative member identity.
 * @returns Stable member identity or undefined.
 * @throws StableIdError for invalid service, explicit, or derived IDs.
 */
export function encodeMemberId(
  serviceId: string,
  member: string,
  explicitId?: unknown,
): string | undefined {
  return runDiscoverySync(encodeMemberIdEffect(serviceId, member, explicitId));
}

/**
 * Synchronous descriptor identity compatibility boundary.
 * @param input - Descriptor provenance selecting the applicable encoder.
 * @returns Stable identity or undefined for insufficient syntax.
 * @throws StableIdError for invalid explicit or derived IDs.
 */
export function encodeSourceId(input: SourceIdInput): string | undefined {
  return runDiscoverySync(encodeSourceIdEffect(input));
}
