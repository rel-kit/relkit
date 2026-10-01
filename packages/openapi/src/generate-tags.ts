import { Effect } from "effect";
import { observeOpenApi } from "./generate-observability.js";
import type { OpenApiTag, ServiceTagSource } from "./generate-tags.types.js";

/** Choose explicit service tags, falling back to its ID.
 * @param service - Service tag metadata.
 * @returns Effect containing sorted unique names; no expected failure.
 * @example Effect.runSync(serviceTagNamesEffect(service));
 */
export const serviceTagNamesEffect = Effect.fn("OpenApi.serviceTagNames")(
  (service: ServiceTagSource) =>
    observeOpenApi(
      "tags.service",
      Effect.sync(() => {
        const names = [...new Set((service.tags ?? []).filter((tag) => tag.length > 0))].sort();
        return names.length === 0 ? [service.id] : names;
      }),
    ),
);

/** Combine service and route tags for an operation.
 * @param service - Optional owning service.
 * @param routeTags - Route-specific tags.
 * @returns Effect containing sorted unique names; no expected failure.
 * @example Effect.runSync(operationTagsEffect(service, ["read"]));
 */
export const operationTagsEffect = Effect.fn("OpenApi.operationTags")(
  (
    service: ServiceTagSource | undefined,
    routeTags: readonly string[] | undefined,
  ): Effect.Effect<readonly string[]> =>
    observeOpenApi(
      "tags.operation",
      Effect.gen(function* () {
        const serviceTags = service === undefined ? [] : yield* serviceTagNamesEffect(service);
        return [...new Set([...serviceTags, ...(routeTags ?? [])])]
          .filter((tag) => tag.length > 0)
          .sort();
      }),
    ),
);

/** Build top-level tag definitions in stable order.
 * @param services - Services indexed for this document.
 * @param routeTags - Tags actually referenced by operations.
 * @returns Effect containing tag definitions; no expected failure.
 * @example Effect.runSync(documentTagsEffect(services, ["read"]));
 */
export const documentTagsEffect = Effect.fn("OpenApi.documentTags")(
  (
    services: readonly ServiceTagSource[],
    routeTags: readonly string[],
  ): Effect.Effect<readonly OpenApiTag[]> =>
    observeOpenApi(
      "tags.document",
      Effect.gen(function* () {
        const tags = new Map<string, OpenApiTag>();
        for (const service of [...services].sort((left, right) =>
          left.id.localeCompare(right.id),
        )) {
          for (const name of yield* serviceTagNamesEffect(service)) {
            if (!tags.has(name)) {
              const description = service.description ?? service.title;
              tags.set(name, description === undefined ? { name } : { name, description });
            }
          }
        }
        for (const name of [...new Set(routeTags)].filter((tag) => tag.length > 0).sort())
          if (!tags.has(name)) tags.set(name, { name });
        return [...tags.values()].sort((left, right) => left.name.localeCompare(right.name));
      }),
    ),
);
