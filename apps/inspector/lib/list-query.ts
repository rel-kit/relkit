import type { InspectorQuery } from "./api-types";

export function unpagedQuery(
  query: InspectorQuery,
  omitted: readonly (keyof InspectorQuery)[] = [],
): InspectorQuery {
  const blocked = new Set<keyof InspectorQuery>(["cursor", ...omitted]);
  return {
    ...Object.fromEntries(
      Object.entries(query).filter(([key]) => !blocked.has(key as keyof InspectorQuery)),
    ),
    limit: 100,
  } as InspectorQuery;
}
