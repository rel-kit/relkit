import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import * as ts from "typescript";
import { dependencyName, importReferences } from "../../scripts/boundary-imports.ts";

const allowedPackages = new Set(["next", "react", "react-dom"]);
const sourceDirectories = ["apps/inspector/app", "apps/inspector/lib"] as const;
const bundleExtensions = new Set([".js", ".json", ".map"]);
const networkFiles = new Set(["apps/inspector/lib/api.ts", "apps/inspector/lib/stream.ts"]);

export const FORBIDDEN_PAYLOAD_MARKERS = Object.freeze([
  "@zsys/",
  "apps/fixture-commerce",
  "packages/engine",
  "packages/providers-local",
  "packages/cloud-aws",
  "inspector-synthetic-secret-14-16",
  "inspector-synthetic-provider-client-14-16",
  "inspector-synthetic-api-key-14-16",
] as const);

export interface InspectorImportScan {
  readonly files: number;
  readonly violations: readonly string[];
  readonly networkFiles: readonly string[];
}

export interface InspectorBundleScan {
  readonly browserFiles: number;
  readonly serverFiles: number;
  readonly violations: readonly string[];
}

export async function scanInspectorImports(root: string): Promise<InspectorImportScan> {
  const files = (await sourceFiles(root)).filter((file) => !file.endsWith(".test.ts"));
  const violations: string[] = [];
  const network = new Set<string>();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const name = relative(root, file);
    if (/\bfetch\s*\(/.test(source)) network.add(name);
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const reference of importReferences(sourceFile)) {
      const dependency = dependencyName(reference.specifier);
      if (dependency !== undefined && !allowedPackages.has(dependency))
        violations.push(`${name}: forbidden import ${reference.specifier}`);
    }
  }
  for (const file of network) if (!networkFiles.has(file)) violations.push(`${file}: direct fetch`);
  return { files: files.length, violations: violations.sort(), networkFiles: [...network].sort() };
}

export async function scanInspectorBundles(root: string): Promise<InspectorBundleScan> {
  const browser = await firstBundleFiles([
    resolve(root, "apps/inspector/.next/static"),
    resolve(root, "apps/inspector/.next/dev/static"),
  ]);
  const server = await firstBundleFiles([
    resolve(root, "apps/inspector/.next/server"),
    resolve(root, "apps/inspector/.next/dev/server"),
  ]);
  const violations: string[] = [];
  for (const [kind, files] of [
    ["browser", browser],
    ["server", server],
  ] as const)
    for (const file of files) {
      const body = await readFile(file, "utf8");
      for (const marker of FORBIDDEN_PAYLOAD_MARKERS)
        if (body.includes(marker)) violations.push(`${kind} ${relative(root, file)}: ${marker}`);
      if (/["']handler["']\s*:/.test(body))
        violations.push(`${kind} ${relative(root, file)}: handler object`);
      if (/\b(?:ProviderClient|providerClient|clientSecret|secretAccessKey)\b/.test(body))
        violations.push(`${kind} ${relative(root, file)}: provider client or secret`);
    }
  return { browserFiles: browser.length, serverFiles: server.length, violations };
}

export function payloadViolations(label: string, payload: string): readonly string[] {
  const violations = FORBIDDEN_PAYLOAD_MARKERS.filter((marker) => payload.includes(marker)).map(
    (marker) => `${label}: ${marker}`,
  );
  if (/["']handler["']\s*:/.test(payload)) violations.push(`${label}: handler object`);
  if (/\b(?:ProviderClient|providerClient|clientSecret|secretAccessKey)\b/.test(payload))
    violations.push(`${label}: provider client or secret`);
  return violations;
}

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const directory of sourceDirectories)
    files.push(...(await filesUnder(resolve(root, directory))));
  return files.filter((file) => [".ts", ".tsx"].includes(extname(file))).sort();
}

async function bundleFiles(directory: string): Promise<string[]> {
  try {
    return (await filesUnder(directory)).filter((file) => bundleExtensions.has(extname(file)));
  } catch {
    return [];
  }
}

async function firstBundleFiles(directories: readonly string[]): Promise<string[]> {
  for (const directory of directories) {
    const files = await bundleFiles(directory);
    if (files.length > 0) return files;
  }
  return [];
}

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  await visit(directory);
  return files;
}
