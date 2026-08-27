export const apiPackages = [
  "app",
  "config",
  "schema",
  "functions",
  "services",
  "routes",
  "events",
  "jobs",
  "buckets",
  "cache",
  "tools",
  "agents",
  "client",
  "testing",
] as const;

export type ApiPackage = (typeof apiPackages)[number];

export interface PublicEntrypoint {
  readonly source: string;
  readonly name: string;
}

export interface Feature {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly guide: string;
  readonly apiPackage: ApiPackage;
  readonly entrypoints: readonly PublicEntrypoint[];
  readonly examples: readonly string[];
}

export function feature(
  id: string,
  title: string,
  summary: string,
  guide: string,
  apiPackage: ApiPackage,
  entrypoints: readonly (readonly [string, string])[],
  examples: readonly string[],
): Feature {
  return {
    id,
    title,
    summary,
    guide,
    apiPackage,
    entrypoints: entrypoints.map(([source, name]) => ({ source, name })),
    examples,
  };
}
