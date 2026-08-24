import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { agentProviderPropertyOffsets } from "./public-declaration-agent";
import { nonFunctionHandlers } from "./public-declaration-ast";

const publicPackages = [
  "packages/contracts",
  "packages/schema",
  "packages/config",
  "packages/diagnostics",
  "packages/functions",
  "packages/services",
  "packages/routes",
  "packages/jobs",
  "packages/events",
  "packages/buckets",
  "packages/cache",
  "packages/tools",
  "packages/agents",
  "packages/app",
  "packages/testing",
] as const;

const forbiddenSymbols = [
  ["Layer", /\bLayer\b/g],
  ["Context.Tag", /\bContext\.Tag\b/g],
  ["Schema.Schema", /\bSchema\.Schema\b/g],
  ["Fiber", /\bFiber\b/g],
  ["Cause", /\bCause\b/g],
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
    /from ["']@zsys\/(?:providers-local|providers-standard|cloud-aws|deploy-pulumi|runtime-effect|runtime-hono|engine|observability|supervisor|inspector-api)(?:\/|["'])/g,
  ],
  [
    "framework-or-provider-import",
    /from ["'](?:ai|effect|hono|next|openai|@(?:ai-sdk|effect|hono|next|pulumi|aws-sdk|azure|google-cloud|cloudflare|anthropic-ai|google-generative-ai)\/|aws-sdk)[^"']*["']/g,
  ],
] as const;

type PackageManifest = {
  exports?: {
    "."?: {
      types?: unknown;
    };
  };
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

function declarationEntry(root: string, packagePath: string): string {
  const packageRoot = resolve(root, packagePath);
  const types = readPackageManifest(packageRoot).exports?.["."]?.types;
  if (typeof types !== "string" || !types.endsWith(".d.ts")) {
    throw new Error(`${packagePath} must expose a .d.ts types export`);
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
  for (const packagePath of publicPackages) {
    const pending = [declarationEntry(root, packagePath)];
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
      pending.push(...localDeclarationReferences(file, text));
    }
  }
  return leaks.sort((left, right) =>
    `${left.file}:${left.line}:${left.column}:${left.symbol}`.localeCompare(
      `${right.file}:${right.line}:${right.column}:${right.symbol}`,
    ),
  );
}

function declarationSymbols(file: string): typeof forbiddenSymbols {
  return file.includes("/packages/testing/")
    ? forbiddenSymbols.filter(([symbol]) => symbol !== "internal-provider-sdk")
    : forbiddenSymbols;
}

async function emitDeclarations(root: string): Promise<void> {
  const child = Bun.spawn(
    [process.execPath, "x", "tsc", "-b", ...publicPackages, "--pretty", "false"],
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
  console.log(`Public declaration scan passed (${publicPackages.length} packages).`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
