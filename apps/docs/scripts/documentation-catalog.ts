/** Maps public package identities and feature entrypoints to generated documentation. */
export const apiPackageDefinitions = [
  apiPackage("app", "Application", "relkit", "packages/relkit/src/app", "core"),
  apiPackage("config", "Configuration", "relkit/config", "packages/relkit/src/config", "core"),
  apiPackage("effect", "Effect", "relkit/effect", "packages/relkit/src/app", "core"),
  apiPackage(
    "provider",
    "Provider authoring",
    "relkit/provider",
    "packages/relkit/src/provider",
    "core",
  ),
  apiPackage(
    "providers-local",
    "Local providers",
    "relkit/providers-local",
    "packages/relkit/src/providers-local",
    "core",
  ),
  apiPackage(
    "observability-local",
    "Local history",
    "@relkit/inspector/observability-local",
    "packages/inspector/src/observability-local",
    "core",
  ),
  apiPackage("cli-api", "CLI automation", "@relkit/cli", "packages/cli", "core"),
  apiPackage(
    "create-relkit",
    "Project generator",
    "create-relkit",
    "packages/create-relkit",
    "core",
  ),
  apiPackage("schema", "Schema", "relkit/schema", "packages/relkit/src/schema", "core"),
  apiPackage("functions", "Functions", "relkit/functions", "packages/relkit/src/functions", "core"),
  apiPackage("services", "Services", "relkit/services", "packages/relkit/src/services", "core"),
  apiPackage("drizzle", "Drizzle", "@relkit/drizzle", "packages/drizzle", "core"),
  apiPackage("better-auth", "Better Auth", "@relkit/better-auth", "packages/better-auth", "core"),
  apiPackage("routes", "Routes", "relkit/routes", "packages/relkit/src/routes", "core"),
  apiPackage("events", "Events", "relkit/events", "packages/relkit/src/events", "core"),
  apiPackage("jobs", "Jobs", "relkit/jobs", "packages/relkit/src/jobs", "core"),
  apiPackage("buckets", "Buckets", "relkit/buckets", "packages/relkit/src/buckets", "core"),
  apiPackage("cache", "Cache", "relkit/cache", "packages/relkit/src/cache", "core"),
  apiPackage("tools", "Tools", "relkit/tools", "packages/relkit/src/tools", "core"),
  apiPackage("agents", "Agents", "relkit/agents", "packages/relkit/src/agents", "core"),
  apiPackage(
    "integrations/langchain",
    "LangChain",
    "@relkit/langchain",
    "integrations/packages/langchain",
    "integrations",
  ),
  apiPackage("client", "Client", "@relkit/client", "packages/client", "core"),
  apiPackage("realtime", "Realtime", "relkit/realtime", "packages/relkit/src/realtime", "core"),
  apiPackage("testing", "Testing", "@relkit/testing", "packages/testing", "core"),
  apiPackage(
    "inspector",
    "Standalone Inspector",
    "@relkit/inspector",
    "packages/inspector",
    "core",
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
  apiPackage(
    "integrations/inngest",
    "Inngest",
    "@relkit/inngest",
    "integrations/packages/inngest",
    "integrations",
  ),
  apiPackage(
    "integrations/trigger",
    "Trigger.dev",
    "@relkit/trigger",
    "integrations/packages/trigger",
    "integrations",
  ),
  apiPackage(
    "integrations/effect-mq",
    "Effect MQ",
    "@relkit/effect-mq",
    "integrations/packages/effect-mq",
    "integrations",
  ),
] as const;

/** A source area merged into a package, such as `packages/relkit/src/functions`. */
const AREA_DIRECTORY = /^(?:packages|integrations\/packages)\/[^/]+\/src\/[^/]+$/;

/** Source folder documented for a catalog directory: a `relkit` area is its own source folder.
 * @param directory - Workspace package or a merged area's folder. @returns Folder holding the sources. */
export function sourceDirectory(directory: string): string {
  return AREA_DIRECTORY.test(directory) ? directory : `${directory}/src`;
}

/** Workspace package that owns a catalog directory.
 * @param directory - Workspace package or a merged area's folder. @returns Package directory. */
export function packageDirectory(directory: string): string {
  return AREA_DIRECTORY.test(directory) ? directory.replace(/\/src\/[^/]+$/, "") : directory;
}

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
