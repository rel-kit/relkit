import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { agentProviderPropertyOffsets } from "./public-declaration-agent";
import { nonFunctionHandlers } from "./public-declaration-ast";

/** Public declaration entry points: a package and one export subpath. */
const publicEntries = [
  ...[
    "contracts",
    "schema",
    "config",
    "provider",
    "diagnostics",
    "functions",
    "services",
    "routes",
    "jobs",
    "events",
    "buckets",
    "cache",
    "tools",
    "agents",
  ].map((area) => ["packages/relkit", `./${area}`] as const),
  ["packages/relkit", "."],
  ["packages/testing", "."],
] as const;

/** `relkit` areas that public declarations must not reach; `observability/telemetry` is public. */
const internalAreaFile =
  /\/packages\/relkit\/dist\/(?:providers-local|runtime-effect|runtime-hono|engine|observability\/(?!telemetry(?:-config\.types)?\.d\.ts$))/;

const forbiddenSymbols = [
  // Native Effect constructors and injectable services are documented public APIs.
  // Framework and provider implementations remain forbidden below.
  ["Hono", /\bHono(?:Context|Request|Response)?\b/g],
  ["Next.js", /\bNext(?:JS|\.js)?\b/g],
  ["Pulumi", /\bPulumi\b|from ["'](?:pulumi|@pulumi\/)[^"']*["']/g],
  [
    "cloud-client",
    /\b(?:S3|DynamoDB|Redis|CloudWatch|EventBridge|SQS|ECS|RDS|Aws|Azure|Gcp|OpenAI|Anthropic|Gemini|Bedrock)(?:Client|Provider|Runtime)?\b/g,
  ],
  ["provider-client", /\b[A-Z][A-Za-z0-9]*ProviderClient\b/g],
  [
    "internal-provider-sdk",
    /from ["'](?:@relkit\/(?:aws\/cloud-aws|pulumi\/engine|cli)|relkit\/(?:providers-local|runtime-effect|runtime-hono|engine|inspector-api|observability(?!\/telemetry["'])))(?:\/|["'])/g,
  ],
  [
    "framework-or-provider-import",
    /from ["'](?:ai|hono|next|openai|@(?:ai-sdk|effect|hono|next|pulumi|aws-sdk|azure|google-cloud|cloudflare|anthropic-ai|google-generative-ai)\/|aws-sdk)[^"']*["']/g,
  ],
] as const;

type PackageManifest = {
  exports?: Record<string, { types?: unknown }>;
};

export type DeclarationLeak = {
  file: string;
  line: number;
  column: number;
  symbol: string;
};

function readPackageManifest(packageRoot: string): PackageManifest {
  return JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as PackageManifest;
}

function declarationEntry(root: string, packagePath: string, subpath: string): string {
  const packageRoot = resolve(root, packagePath);
  const types = readPackageManifest(packageRoot).exports?.[subpath]?.types;
  if (typeof types !== "string" || !types.endsWith(".d.ts")) {
    throw new Error(`${packagePath} must expose a .d.ts types export for ${subpath}`);
  }
  const entry = resolve(packageRoot, types);
  if (!existsSync(entry)) throw new Error(`Missing emitted declaration: ${relative(root, entry)}`);
  return entry;
}

function localDeclarationReferences(file: string, text: string): string[] {
  const references: string[] = [];
  const pattern = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[1];
    if (!specifier?.startsWith(".")) continue;
    const candidate = resolve(dirname(file), specifier.replace(/\.(?:m?js|cjs)$/, ".d.ts"));
    if (existsSync(candidate)) references.push(candidate);
  }
  return references;
}

function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return {
    line: before.split("\n").length,
    column: offset - lineStart + 1,
  };
}

export function scanPublicDeclarations(root: string): DeclarationLeak[] {
  const leaks: DeclarationLeak[] = [];
  for (const [packagePath, subpath] of publicEntries) {
    const entry = declarationEntry(root, packagePath, subpath);
    // Each entry is scanned within its own folder, as each former package was.
    const scope = dirname(entry);
    const pending = [entry];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const file = pending.pop();
      if (!file || visited.has(file)) continue;
      visited.add(file);
      const text = readFileSync(file, "utf8");
      for (const [symbol, pattern] of declarationSymbols(file)) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          const offset = match.index ?? 0;
          const location = lineAndColumn(text, offset);
          leaks.push({ file: relative(root, file), ...location, symbol });
        }
      }
      for (const leak of nonFunctionHandlers(file, text)) {
        leaks.push({ ...leak, file: relative(root, leak.file) });
      }
      for (const offset of agentProviderPropertyOffsets(file, text))
        leaks.push({
          file: relative(root, file),
          ...lineAndColumn(text, offset),
          symbol: "agent-provider-details",
        });
      for (const reference of localDeclarationReferences(file, text)) {
        if (internalAreaFile.test(reference) && !internalAreaFile.test(file))
          leaks.push({
            file: relative(root, file),
            line: 1,
            column: 1,
            symbol: "internal-provider-sdk",
          });
        else if (reference.startsWith(scope + "/")) pending.push(reference);
      }
    }
  }
  return leaks.sort((left, right) =>
    `${left.file}:${left.line}:${left.column}:${left.symbol}`.localeCompare(
      `${right.file}:${right.line}:${right.column}:${right.symbol}`,
    ),
  );
}

function declarationSymbols(file: string): typeof forbiddenSymbols {
  if (/\/packages\/relkit\/dist\/routes\/define-middleware(?:\.types)?\.d\.ts$/.test(file))
    return forbiddenSymbols.filter(
      ([symbol]) => symbol !== "Next.js" && symbol !== "framework-or-provider-import",
    );
  return file.includes("/packages/testing/")
    ? forbiddenSymbols.filter(([symbol]) => symbol !== "internal-provider-sdk")
    : forbiddenSymbols;
}

async function emitDeclarations(root: string): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      "x",
      "tsc",
      "-b",
      ...new Set(publicEntries.map(([packagePath]) => packagePath)),
      "--pretty",
      "false",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (exitCode !== 0) throw new Error(`Declaration emission failed with exit code ${exitCode}`);
}

async function main(): Promise<void> {
  const root = resolve(process.argv[2] ?? resolve(import.meta.dir, ".."));
  await emitDeclarations(root);
  const leaks = scanPublicDeclarations(root);
  if (leaks.length > 0) {
    for (const leak of leaks) {
      console.error(
        `${leak.file}:${leak.line}:${leak.column} [public-declaration-leak] ${leak.symbol}`,
      );
    }
    throw new Error(`Public declaration scan failed with ${leaks.length} forbidden symbol(s).`);
  }
  console.log(`Public declaration scan passed (${publicEntries.length} entry points).`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
