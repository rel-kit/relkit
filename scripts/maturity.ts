/**
 * Holds the Core and Labs assignment and fails when package manifests, TSDoc tags and docs badges
 * disagree with it. The docs maturity page is generated from `MATURITY_FEATURES`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { firstPartyExports } from "./first-party-exports.js";
import { readPackageTiers, type PackageTier } from "./maturity-packages.js";
export { readPackageTiers, type PackageTier } from "./maturity-packages.js";

export type MaturityTier = "core" | "labs";

/** One row of the maturity table. Every workspace package belongs to at least one feature. */
export interface MaturityFeature {
  readonly name: string;
  readonly tier: MaturityTier;
  readonly packages: readonly string[];
  /** Docs routes for the feature; every route of a Labs feature carries `labs: true`. */
  readonly docs: readonly string[];
  readonly note?: string;
}

const core = (
  name: string,
  packages: readonly string[],
  docs: readonly string[],
  note?: string,
): MaturityFeature => ({ name, tier: "core", packages, docs, ...(note ? { note } : {}) });
const labs = (
  name: string,
  packages: readonly string[],
  docs: readonly string[],
): MaturityFeature => ({ name, tier: "labs", packages, docs });

export const MATURITY_FEATURES: readonly MaturityFeature[] = [
  core(
    "Application model and compiler",
    [
      "relkit",
      "@relkit/app",
      "relkit/contracts",
      "relkit/graph",
      "relkit/engine",
      "relkit/invocation",
      "relkit/diagnostics",
      "relkit/provider",
      "relkit/runtime-effect",
    ],
    ["/docs/learn/concepts/application"],
  ),
  core("Functions", ["relkit/functions"], ["/docs/learn/concepts/functions"]),
  core("Services", ["relkit/services"], ["/docs/modules/service"]),
  core(
    "Routes",
    ["relkit/routes", "relkit/runtime-hono", "relkit/runtime"],
    ["/docs/modules/http"],
  ),
  core("Schemas", ["relkit/schema", "relkit/openapi"], ["/docs/learn/concepts/schemas"]),
  core("Env and config", ["relkit/config"], ["/docs/learn/concepts/environment"]),
  core("Events", ["relkit/events"], ["/docs/modules/events"]),
  core(
    "Jobs and schedules with local and Postgres backends",
    ["relkit/jobs", "@relkit/local", "relkit/providers-local", "relkit/local-service"],
    ["/docs/modules/jobs"],
  ),
  core("Cache", ["relkit/cache", "@relkit/redis"], ["/docs/modules/caching"]),
  core("Buckets", ["relkit/buckets", "@relkit/s3"], ["/docs/modules/storage"]),
  core("Drizzle", ["@relkit/drizzle"], ["/docs/modules/database/drizzle"]),
  core("Better Auth", ["@relkit/better-auth"], ["/docs/modules/auth/better-auth"]),
  core(
    "Built-in telemetry",
    ["relkit/observability", "@relkit/inspector"],
    ["/docs/modules/operations/observability"],
  ),
  core("Typed client", ["@relkit/client"], ["/docs/modules/client"]),
  core("Testing", ["@relkit/testing"], ["/docs/modules/operations/testing"]),
  core("CLI", ["relkit", "@relkit/cli", "create-relkit"], ["/docs/modules/cli"]),
  core(
    "Inspector",
    ["@relkit/inspector", "relkit/inspector-api"],
    ["/docs/modules/operations/inspector"],
  ),
  core("relkit mcp", ["@relkit/cli"], ["/docs/modules/ai/mcp"]),
  core("Agent declarations and tools", ["relkit/agents", "relkit/tools"], ["/docs/modules/ai"]),
  core("Bun and Node LTS runtimes", [], ["/docs/learn/local-development"]),
  core("Integration catalog", ["create-relkit"], ["/docs/modules/integrations"]),
  core(
    "Docker deploy",
    ["@relkit/docker", "relkit/deploy"],
    ["/docs/modules/deployment/local-docker"],
  ),

  labs(
    "Realtime",
    ["relkit/realtime"],
    [
      "/docs/modules/realtime",
      "/docs/modules/realtime/access",
      "/docs/modules/realtime/react",
      "/docs/modules/realtime/presence",
      "/docs/modules/realtime/recovery",
      "/docs/modules/realtime/providers",
      "/docs/api/realtime",
    ],
  ),
  labs("Railway deploy", [], ["/docs/modules/deployment/railway"]),
  labs(
    "AWS hosting",
    ["@relkit/aws", "@relkit/pulumi"],
    ["/docs/modules/deployment/aws", "/docs/api/integrations/aws", "/docs/api/integrations/pulumi"],
  ),
  labs("Cloudflare bindings", ["@relkit/cloudflare"], ["/docs/api/integrations/cloudflare"]),
  labs(
    "Inngest job adapter",
    ["@relkit/inngest"],
    ["/docs/modules/jobs/providers/inngest", "/docs/api/integrations/inngest"],
  ),
  labs(
    "Trigger.dev job adapter",
    ["@relkit/trigger"],
    ["/docs/modules/jobs/providers/trigger", "/docs/api/integrations/trigger"],
  ),
  labs(
    "Effect MQ job adapter",
    ["@relkit/effect-mq"],
    ["/docs/modules/jobs/providers/effect-mq", "/docs/api/integrations/effect-mq"],
  ),
  labs(
    "Postgres durable backend",
    ["@relkit/postgres"],
    ["/docs/modules/jobs/providers/postgres", "/docs/api/integrations/postgres"],
  ),
  labs(
    "Agent adapters (LangChain, DeepAgents and AI SDK)",
    ["relkit/agent-adapters", "@relkit/langchain", "@relkit/ai-sdk"],
    [
      "/docs/modules/ai/adapters",
      "/docs/modules/ai/native-runtime",
      "/docs/api/agent-adapters",
      "/docs/api/integrations/langchain",
      "/docs/api/integrations/ai-sdk",
    ],
  ),
  labs("Graph workflows", ["@relkit/langchain"], ["/docs/modules/ai/graphs-persistence"]),
  labs("Sentry telemetry", ["@relkit/sentry"], ["/docs/api/integrations/sentry"]),
  labs("OTLP telemetry", ["@relkit/otlp"], ["/docs/api/integrations/otlp"]),
];

const docsContent = "apps/docs/content";

/** Lists the docs routes whose frontmatter sets `labs: true`.
 * @param root - Repository root. @returns Routes such as `/docs/modules/realtime`. */
export function readLabsRoutes(root: string): string[] {
  const content = join(root, docsContent);
  return mdxFiles(content)
    .filter((file) => /^labs:\s*true\s*$/mu.test(frontmatter(readFileSync(file, "utf8"))))
    .map((file) => routeOf(relative(content, file)))
    .sort();
}

/** Resolves a docs route to its content file, or undefined when no page exists.
 * @param root - Repository root. @param route - Docs route. @returns Absolute file path. */
export function docsFile(root: string, route: string): string | undefined {
  const base = join(root, docsContent, route.replace(/^\//u, ""));
  return [`${base}.mdx`, `${base}.md`, join(base, "index.mdx"), join(base, "index.md")].find(
    existsSync,
  );
}

/** An export of a Labs package whose declaration has no `@experimental` tag. */
export interface UntaggedExport {
  readonly packageName: string;
  readonly name: string;
  readonly file: string;
  readonly line: number;
}

/**
 * Finds exports declared inside Labs packages that lack `@experimental`. Re-exports of another
 * package's declarations are checked where they are declared. First-party-only entry points are skipped.
 * @param root - Repository root. @param packages - Labs packages to scan.
 * @returns Untagged exports and entries whose source could not be found.
 */
export function untaggedLabsExports(
  root: string,
  packages: readonly PackageTier[],
): { untagged: UntaggedExport[]; missingSources: string[] } {
  const missingSources: string[] = [];
  const entries = packages.flatMap((item) =>
    publicEntries(root, item.directory, item.area).flatMap(({ subpath, file }) => {
      if (file) return [{ item, file }];
      missingSources.push(`${item.name} export "${subpath}" has no source file under src/`);
      return [];
    }),
  );
  const program = ts.createProgram(
    entries.map(({ file }) => file),
    {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      noEmit: true,
      skipLibCheck: true,
      noResolve: false,
    },
  );
  const checker = program.getTypeChecker();
  const seen = new Set<ts.Declaration>();
  const untagged: UntaggedExport[] = [];
  for (const { item, file } of entries) {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) continue;
    const own = resolve(root, item.source) + sep;
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const declarations = (symbol.declarations ?? []).filter((declaration) =>
        declaration.getSourceFile().fileName.startsWith(own),
      );
      if (declarations.length === 0 || declarations.some((declaration) => seen.has(declaration)))
        continue;
      for (const declaration of declarations) seen.add(declaration);
      if (declarations.some(isExperimental)) continue;
      const [first] = declarations as [ts.Declaration];
      const sourceFile = first.getSourceFile();
      untagged.push({
        packageName: item.name,
        name: exported.name,
        file: relative(root, sourceFile.fileName),
        line: sourceFile.getLineAndCharacterOfPosition(first.getStart()).line + 1,
      });
    }
  }
  return { untagged, missingSources };
}

/** Finds `@experimental` tags in the sources of Core packages.
 * @param root - Repository root. @param packages - Core packages to scan.
 * @returns `file:line` locations. */
export function experimentalInCore(root: string, packages: readonly PackageTier[]): string[] {
  return packages.flatMap(({ source }) =>
    sourceFiles(join(root, source)).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((text, index) =>
          /@experimental\b/u.test(text) ? [`${relative(root, file)}:${index + 1}`] : [],
        ),
    ),
  );
}

/**
 * Compares the maturity table with manifests, TSDoc tags and docs flags.
 * @param root - Repository root. @param features - Maturity table to check against.
 * @returns One message per disagreement; empty when everything agrees.
 */
export function maturityProblems(
  root: string,
  features: readonly MaturityFeature[] = MATURITY_FEATURES,
): string[] {
  const problems: string[] = [];
  const packages = readPackageTiers(root);
  const byName = new Map(packages.map((item) => [item.name, item]));
  for (const item of packages)
    if (item.tier !== "core" && item.tier !== "labs")
      problems.push(`${item.name}: set "relkit.maturity" to "core" or "labs" in its package.json`);
  const listed = new Set(features.flatMap(({ packages: names }) => names));
  for (const item of packages)
    if (!listed.has(item.name)) problems.push(`${item.name} is not in the maturity table`);
  for (const feature of features)
    for (const name of feature.packages) {
      const item = byName.get(name);
      if (!item) problems.push(`${feature.name}: package ${name} does not exist`);
      else if (item.tier !== feature.tier && (item.tier === "core" || item.tier === "labs"))
        problems.push(`${feature.name} is ${feature.tier} but ${name} is ${String(item.tier)}`);
    }

  const labsPackages = packages.filter(({ tier }) => tier === "labs");
  const { untagged, missingSources } = untaggedLabsExports(root, labsPackages);
  problems.push(...missingSources);
  for (const { packageName, name, file, line } of untagged)
    problems.push(`${packageName} export ${name} has no @experimental tag (${file}:${line})`);
  for (const location of experimentalInCore(
    root,
    packages.filter(({ tier }) => tier === "core"),
  ))
    problems.push(`${location}: Core packages must not tag declarations @experimental`);

  const flagged = new Set(readLabsRoutes(root));
  const listedDocs = new Set<string>();
  for (const feature of features)
    for (const route of feature.docs) {
      listedDocs.add(route);
      if (!docsFile(root, route))
        problems.push(`${feature.name}: docs page ${route} does not exist`);
      if (feature.tier === "labs") {
        if (!flagged.has(route)) problems.push(`${route} needs "labs: true" (${feature.name})`);
      } else if (flagged.has(route))
        problems.push(`${route} is flagged Labs but documents Core feature ${feature.name}`);
    }
  for (const route of flagged)
    if (!listedDocs.has(route))
      problems.push(
        `${route} sets "labs: true" but no Labs feature in the maturity table lists it`,
      );
  return problems;
}

function isExperimental(declaration: ts.Declaration): boolean {
  return ts.getJSDocTags(declaration).some(({ tagName }) => tagName.text === "experimental");
}

function publicEntries(
  root: string,
  directory: string,
  area?: string,
): { subpath: string; file: string | undefined }[] {
  const manifest = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8")) as {
    name: string;
    exports?: Record<string, string | { types?: string; import?: string; default?: string }>;
  };
  return Object.entries(manifest.exports ?? {})
    .filter(
      ([subpath]) =>
        !firstPartyExports.has(manifest.name + subpath.slice(1)) && !subpath.endsWith(".json"),
    )
    .filter(([subpath]) => area === undefined || subpath.split("/")[1] === area)
    .map(([subpath, target]) => {
      const path =
        typeof target === "string"
          ? target
          : (target.types ?? target.import ?? target.default ?? "");
      const base = join(
        root,
        directory,
        path.replace(/^\.\/(?:dist|src)\//u, "src/").replace(/(?:\.d\.ts|\.js|\.tsx?)$/u, ""),
      );
      return { subpath, file: [`${base}.ts`, `${base}.tsx`].find(existsSync) };
    });
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function mdxFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.mdx?$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !file.split(sep).some((part) => part.startsWith("_")));
}

function frontmatter(text: string): string {
  return /^---\n([\s\S]*?)\n---/u.exec(text)?.[1] ?? "";
}

function routeOf(path: string): string {
  return `/${path.replace(/\.mdx?$/u, "").replace(/(?:^|\/)index$/u, "")}`;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const problems = maturityProblems(root);
  if (problems.length > 0) {
    console.error(
      `The maturity table in scripts/maturity.ts disagrees with the repository:\n- ${problems.join("\n- ")}`,
    );
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      protocol: "relkit.maturity",
      packages: readPackageTiers(root).length,
      features: MATURITY_FEATURES.length,
    }),
  );
}
