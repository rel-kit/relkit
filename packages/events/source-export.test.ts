import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as eventExports from "./src/index.ts";

type SourceFile = { path: string; text: string };

const repositoryRoot = resolve(import.meta.dir, "../..");
const term = ["sub", "scription"].join("");
const defineName = ["define", "Sub", "scription"].join("");
const pascalTerm = ["Sub", "scription"].join("");
const forbidden = new RegExp(`\\b(?:${defineName}|${term}s?|${pascalTerm}[A-Za-z0-9_-]*)\\b`, "i");
const forbiddenSuffix = new RegExp(`\\.${term}s?\\.ts$`, "i");
const providerInternalPrefixes = [
  "packages/providers-local/",
  "packages/cloud-aws/",
  "tests/contracts/events/provider-internal/",
  "tests/integration/events/provider-internal/",
  "tests/restart/events/provider-internal/",
];
const providerInternalFiles = new Set([
  "packages/inspector-api/src/observability-utils.ts",
  "packages/observability/src/stream-subscriber.ts",
]);
const scanRoots = ["apps", "packages", "templates", "tests", ".relkit/generated", ".relkit/build"];
const scanGuardFiles = new Set([
  "packages/events/source-export.test.ts",
  "tests/e2e/inspector.spec.ts",
  "tests/phase0.test.ts",
]);

function isProviderInternal(path: string): boolean {
  return (
    providerInternalFiles.has(path) ||
    providerInternalPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

function sourceFiles(directory: string): SourceFile[] {
  if (!existsSync(directory)) return [];
  return [
    ...new Bun.Glob("**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json}").scanSync({
      cwd: directory,
      onlyFiles: true,
    }),
  ]
    .filter((path) => !/(^|\/)(dist|node_modules|\.turbo|\.relkit)(\/|$)/.test(path))
    .sort()
    .map((path) => ({
      path: relative(repositoryRoot, join(directory, path)).replaceAll("\\", "/"),
      text: readFileSync(join(directory, path), "utf8"),
    }));
}

function repositorySources(): SourceFile[] {
  return scanRoots
    .flatMap((root) => sourceFiles(join(repositoryRoot, root)))
    .filter(({ path }) => !scanGuardFiles.has(path));
}

function violations(files: readonly SourceFile[]): string[] {
  return files.flatMap(({ path, text }) => {
    const findings: string[] = [];
    if (forbiddenSuffix.test(path)) findings.push(`${path}:source-suffix`);
    if (!isProviderInternal(path) && forbidden.test(text)) findings.push(`${path}:source-name`);
    return findings;
  });
}

test("event source and exports keep listeners as generic triggers", () => {
  expect(violations(repositorySources())).toEqual([]);
  expect(Object.keys(eventExports).some((name) => forbidden.test(name))).toBe(false);
  expect(eventExports).toHaveProperty("defineEvent");
  expect(eventExports).toHaveProperty("onEvent");
  expect(eventExports).toHaveProperty("events");
});

test("artifact scans reject application names in generated, graph, API, and inspector contracts", () => {
  const generated = `.relkit/generated/application.graph.json`;
  const graph = "packages/graph/src/model.ts";
  const api = "packages/inspector-api/src/contracts.ts";
  const inspector = "apps/inspector/src/navigation.tsx";
  const packageName = `@relkit/${term}s`;
  const navigation = `/${term}s`;
  const kind = `${term}Kind`;
  expect(
    violations([
      { path: generated, text: `{"kind":"${term}"}\n` },
      { path: graph, text: `export type NodeKind = "${term}";\n` },
      { path: api, text: `export type ${pascalTerm}Kind = "application";\n` },
      { path: inspector, text: `const href = "${navigation}";\nconst name = "${kind}";\n` },
      { path: "packages/events/src/index.ts", text: `export * from "${packageName}";\n` },
    ]),
  ).toEqual([
    `${generated}:source-name`,
    `${graph}:source-name`,
    `${api}:source-name`,
    `${inspector}:source-name`,
    "packages/events/src/index.ts:source-name",
  ]);
});

test("the scan rejects public names but permits allowlisted provider terminology", () => {
  const providerPath = "packages/providers-local/src/events/broker.ts";
  const publicPath = "packages/events/src/index.ts";
  expect(
    violations([{ path: providerPath, text: `type ${pascalTerm}Kind = "broker";\n` }]),
  ).toEqual([]);
  expect(
    violations([{ path: publicPath, text: `export type ${pascalTerm}Descriptor = unknown;\n` }]),
  ).toEqual([`${publicPath}:source-name`]);
  expect(violations([{ path: publicPath, text: `export const value = ${defineName};\n` }])).toEqual(
    [`${publicPath}:source-name`],
  );
  expect(
    violations([{ path: `examples/commerce/src/events.${term}.ts`, text: "export {};\n" }]),
  ).toEqual([`examples/commerce/src/events.${term}.ts:source-suffix`]);
});
