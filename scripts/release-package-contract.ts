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

export function expectedExports(directoryName: string): Record<string, unknown> {
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
  if (directoryName === "drizzle")
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
  return { ".": rootExport };
}
