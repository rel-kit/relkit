const rootExport = { types: "./dist/index.d.ts", import: "./dist/index.js" };
const appSubpaths = [
  "schema",
  "config",
  "routes",
  "functions",
  "events",
  "agents",
  "jobs",
  "cache",
  "tools",
  "buckets",
  "services",
] as const;

const integrationSubpaths: Readonly<Record<string, readonly string[]>> = {
  "@relkit/ai-sdk": ["runtime"],
  "@relkit/aws": ["host", "infrastructure", "access"],
  "@relkit/cloudflare": ["runtime"],
  "@relkit/docker": ["runtime"],
  "@relkit/local": ["runtime"],
  "@relkit/otlp": ["runtime"],
  "@relkit/pulumi": ["engine"],
  "@relkit/redis": ["runtime", "local-recipe"],
  "@relkit/s3": ["runtime", "local-recipe"],
  "@relkit/sentry": ["runtime"],
};

const catalogSubpaths = [
  "redis",
  "s3",
  "docker",
  "local",
  "cloudflare",
  "ai-sdk",
  "sentry",
  "otlp",
  "aws",
  "pulumi",
] as const;

export function expectedExports(
  directoryName: string,
  packageName?: string,
): Record<string, unknown> {
  if (packageName === "@relkit/integrations")
    return Object.fromEntries([
      [".", rootExport],
      ...catalogSubpaths.map((subpath) => [
        `./${subpath}`,
        { types: `./dist/${subpath}.d.ts`, import: `./dist/${subpath}.js` },
      ]),
    ]);
  const subpaths = packageName ? integrationSubpaths[packageName] : undefined;
  if (subpaths)
    return Object.fromEntries([
      [".", rootExport],
      ...subpaths.map((subpath) => [
        `./${subpath}`,
        {
          types: `./dist/${subpath}/index.d.ts`,
          import: `./dist/${subpath}/index.js`,
        },
      ]),
    ]);
  if (directoryName === "cloud-aws")
    return {
      ".": rootExport,
      "./runtime": {
        types: "./dist/runtime/index.d.ts",
        import: "./dist/runtime/index.js",
      },
    };
  if (directoryName === "app")
    return Object.fromEntries([
      [".", rootExport],
      ...appSubpaths.map((subpath) => [
        `./${subpath}`,
        { types: `./dist/${subpath}.d.ts`, import: `./dist/${subpath}.js` },
      ]),
    ]);
  if (directoryName === "cli")
    return {
      ".": rootExport,
      "./help": {
        types: "./dist/cli-help-model.d.ts",
        import: "./dist/cli-help-model.js",
      },
    };
  if (directoryName === "config")
    return {
      ".": rootExport,
      "./internal/config": {
        types: "./dist/internal/config.d.ts",
        import: "./dist/internal/config.js",
      },
    };
  if (directoryName === "drizzle" || directoryName === "functions")
    return {
      ".": rootExport,
      "./internal": {
        types: "./dist/internal.d.ts",
        import: "./dist/internal.js",
      },
    };
  if (directoryName === "client")
    return {
      ".": rootExport,
      "./tanstack-query": {
        types: "./dist/tanstack-query.d.ts",
        import: "./dist/tanstack-query.js",
      },
    };
  if (directoryName === "observability")
    return {
      ".": rootExport,
      "./telemetry": {
        types: "./dist/telemetry.d.ts",
        import: "./dist/telemetry.js",
      },
      "./local": {
        types: "./dist/local/index.d.ts",
        import: "./dist/local/index.js",
      },
    };
  return { ".": rootExport };
}
