/**
 * Compiles real emitted client declarations with strict library checking. A
 * consumer-only resolver withholds frontend peers for root/server cases and
 * exposes installed peers for opt-in entrypoints; no module declarations are
 * substituted. Fresh external packed installs remain a separate acceptance gate.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";
import {
  clientContractSource as contract,
  clientMisuseSource,
  clientQuerySource,
  clientReactSource,
  clientQueryMisuse,
} from "../consumer-client-sources.js";

const root = resolve(import.meta.dirname, "../..");
const consumer = resolve(root, "packages/client/client-isolation-consumer.ts");
const frontend = /^(?:@orpc\/tanstack-query(?:\/|$)|@tanstack\/|react(?:\/|$))/;

/**
 * Resolves the actual declaration graph while controlling peer visibility.
 * @param source - Consumer source including real registry augmentation.
 * @param peers - Frontend package names explicitly available to this consumer.
 * @returns Real compiler diagnostics and all requested import specifiers.
 */
function compileConsumer(source: string, peers: readonly string[] = []) {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    customConditions: ["bun"],
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    types: ["bun"],
    exactOptionalPropertyTypes: true,
  };
  const requested: string[] = [];
  const host = ts.createCompilerHost(options);
  const readSource = host.getSourceFile;
  host.getSourceFile = (path, languageVersion, onError, shouldCreate) =>
    path === consumer
      ? ts.createSourceFile(path, source, languageVersion, true)
      : readSource(path, languageVersion, onError, shouldCreate);
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) => {
      requested.push(name);
      if (
        frontend.test(name) &&
        !peers.some((peer) => name === peer || name.startsWith(`${peer}/`))
      )
        return undefined;
      return ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
    });
  const program = ts.createProgram([consumer], options, host);
  return {
    diagnostics: ts.getPreEmitDiagnostics(program),
    requested,
    files: program.getSourceFiles().map((file) => file.fileName),
  };
}

/**
 * Formats diagnostics so a failing strict consumer exposes exact upstream errors.
 * @param diagnostics - Compiler diagnostics from the consumed declaration graph.
 * @returns Stable human-readable messages including diagnostic codes.
 */
function messages(diagnostics: readonly ts.Diagnostic[]) {
  return diagnostics.map(
    (item) => `${item.code}: ${ts.flattenDiagnosticMessageText(item.messageText, " ")}`,
  );
}

test("server_registry_inference_no_frontend", () => {
  const result = compileConsumer(contract);
  expect(messages(result.diagnostics)).toEqual([]);
  expect(result.requested.filter((name) => frontend.test(name))).toEqual([]);
  expect(result.files.some((file) => file.endsWith("/client/dist/index.d.ts"))).toBe(true);
  expect(result.files.some((file) => file.endsWith("/client/dist/server.d.ts"))).toBe(true);
}, 30_000);

test("server_registry_rejects_wrong_input_output_and_missing_procedures", () => {
  const result = compileConsumer(clientMisuseSource);
  expect(result.diagnostics.map((item) => item.code)).toEqual([2322, 2339, 2322]);
}, 30_000);

test("selected_frontend_only_documented_peers", () => {
  const result = compileConsumer(clientReactSource, [
    "@orpc/tanstack-query",
    "@tanstack/query-core",
    "@tanstack/react-query",
    "react",
  ]);
  expect(messages(result.diagnostics)).toEqual([]);
  expect(result.requested).toContain("@orpc/tanstack-query");
  expect(result.requested).toContain("react");
}, 30_000);

test("selected_query_and_server_hydration_without_react", () => {
  const result = compileConsumer(clientQuerySource, [
    "@orpc/tanstack-query",
    "@tanstack/query-core",
  ]);
  expect(messages(result.diagnostics)).toEqual([]);
  expect(result.requested).not.toContain("react");
  expect(result.requested).not.toContain("@tanstack/react-query");
}, 30_000);

test("selected_query_rejects_wrong_native_result", () => {
  const result = compileConsumer(clientQueryMisuse(clientQuerySource), [
    "@orpc/tanstack-query",
    "@tanstack/query-core",
  ]);
  expect(result.diagnostics.map((item) => item.code)).toEqual([2322]);
}, 30_000);

test("selected_frontend_reports_missing_peer_without_type_workarounds", () => {
  const result = compileConsumer('export * from "@relkit/client/tanstack-query";');
  expect(result.diagnostics.some((item) => item.code === 2307)).toBe(true);
  expect(result.requested).toContain("@orpc/tanstack-query");
});

test("frontend_packages_are_explicit_optional_peers", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "packages/client/package.json"), "utf8"));
  for (const name of [
    "react",
    "@tanstack/query-core",
    "@tanstack/react-query",
    "@orpc/tanstack-query",
  ]) {
    expect(manifest.dependencies[name]).toBeUndefined();
    expect(manifest.peerDependencies[name]).toBeDefined();
    expect(manifest.peerDependenciesMeta[name]).toEqual({ optional: true });
    expect(manifest.devDependencies[name]).toBeDefined();
  }
});
