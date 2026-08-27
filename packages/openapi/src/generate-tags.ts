import type { ServiceNode } from "@relkit/graph";

export interface OpenApiTag {
  readonly name: string;
  readonly description?: string;
}

type ServiceTagSource = Pick<ServiceNode, "id" | "title" | "description" | "tags">;

export function serviceTagNames(service: ServiceTagSource): readonly string[] {
  const names = [...new Set((service.tags ?? []).filter((tag) => tag.length > 0))].sort();
  return names.length === 0 ? [service.id] : names;
}

export function operationTags(
  service: ServiceTagSource | undefined,
  routeTags: readonly string[] | undefined,
): readonly string[] {
  return [
    ...new Set([...(service === undefined ? [] : serviceTagNames(service)), ...(routeTags ?? [])]),
  ]
    .filter((tag) => tag.length > 0)
    .sort();
}

export function documentTags(
  services: readonly ServiceTagSource[],
  routeTags: readonly string[],
): readonly OpenApiTag[] {
  const tags = new Map<string, OpenApiTag>();
  for (const service of [...services].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const name of serviceTagNames(service)) {
      if (!tags.has(name)) {
        const description = service.description ?? service.title;
        tags.set(name, description === undefined ? { name } : { name, description });
      }
    }
  }
  for (const name of [...new Set(routeTags)].filter((tag) => tag.length > 0).sort())
    if (!tags.has(name)) tags.set(name, { name });
  return [...tags.values()].sort((left, right) => left.name.localeCompare(right.name));
}
