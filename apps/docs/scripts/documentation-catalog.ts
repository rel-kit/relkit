export const apiPackageDefinitions = [
  apiPackage("app", "Application", "@relkit/app", "packages/app", "core"),
  apiPackage("config", "Configuration", "@relkit/config", "packages/config", "core"),
  apiPackage("schema", "Schema", "@relkit/schema", "packages/schema", "core"),
  apiPackage("functions", "Functions", "@relkit/functions", "packages/functions", "core"),
  apiPackage("services", "Services", "@relkit/services", "packages/services", "core"),
  apiPackage("drizzle", "Drizzle", "@relkit/drizzle", "packages/drizzle", "core"),
  apiPackage("better-auth", "Better Auth", "@relkit/better-auth", "packages/better-auth", "core"),
  apiPackage("routes", "Routes", "@relkit/routes", "packages/routes", "core"),
  apiPackage("events", "Events", "@relkit/events", "packages/events", "core"),
  apiPackage("jobs", "Jobs", "@relkit/jobs", "packages/jobs", "core"),
  apiPackage("buckets", "Buckets", "@relkit/buckets", "packages/buckets", "core"),
  apiPackage("cache", "Cache", "@relkit/cache", "packages/cache", "core"),
  apiPackage("tools", "Tools", "@relkit/tools", "packages/tools", "core"),
  apiPackage("agents", "Agents", "@relkit/agents", "packages/agents", "core"),
  apiPackage("client", "Client", "@relkit/client", "packages/client", "core"),
  apiPackage("testing", "Testing", "@relkit/testing", "packages/testing", "core"),
  apiPackage(
    "integrations/ai-sdk",
    "AI SDK",
    "@relkit/ai-sdk",
    "integrations/packages/ai-sdk",
    "integrations",
  ),
  apiPackage("integrations/aws", "AWS", "@relkit/aws", "integrations/packages/aws", "integrations"),
  apiPackage(
    "integrations/cloudflare",
    "Cloudflare",
    "@relkit/cloudflare",
    "integrations/packages/cloudflare",
    "integrations",
  ),
  apiPackage(
    "integrations/docker",
    "Docker",
    "@relkit/docker",
    "integrations/packages/docker",
    "integrations",
  ),
  apiPackage(
    "integrations/local",
    "Local",
    "@relkit/local",
    "integrations/packages/local",
    "integrations",
  ),
  apiPackage(
    "integrations/otlp",
    "OTLP",
    "@relkit/otlp",
    "integrations/packages/otlp",
    "integrations",
  ),
  apiPackage(
    "integrations/pulumi",
    "Pulumi",
    "@relkit/pulumi",
    "integrations/packages/pulumi",
    "integrations",
  ),
  apiPackage(
    "integrations/redis",
    "Redis",
    "@relkit/redis",
    "integrations/packages/redis",
    "integrations",
  ),
  apiPackage("integrations/s3", "S3", "@relkit/s3", "integrations/packages/s3", "integrations"),
  apiPackage(
    "integrations/sentry",
    "Sentry",
    "@relkit/sentry",
    "integrations/packages/sentry",
    "integrations",
  ),
] as const;

export type ApiPackage = (typeof apiPackageDefinitions)[number]["slug"];

export const apiPackages = apiPackageDefinitions.map(({ slug }) => slug);

export function apiPackageName(slug: ApiPackage): string {
  return apiPackageDefinitions.find((item) => item.slug === slug)!.packageName;
}

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

function apiPackage<
  const Slug extends string,
  const Title extends string,
  const PackageName extends string,
  const Directory extends string,
  const Group extends "core" | "integrations",
>(slug: Slug, title: Title, packageName: PackageName, directory: Directory, group: Group) {
  return { slug, title, packageName, directory, group } as const;
}
