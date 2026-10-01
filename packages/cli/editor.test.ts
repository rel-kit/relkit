import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);

test("the packaged editor plugin reports unsaved route mistakes and offers a working code fix", () => {
  const initialize = require("@relkit/cli/editor") as (modules: {
    typescript: typeof ts;
  }) => ts.server.PluginModule;
  expect(typeof initialize).toBe("function");
  const root = resolve(import.meta.dir, "../../examples/commerce");
  const file = resolve(root, "src/routes/orders/route.ts");
  const original = ts.sys.readFile(file)!;
  let source = original.replace("export const { GET, POST }", "export const GET");
  expect(source).not.toBe(original);
  let version = 0;
  const loaded = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, root);
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => config.options,
    getScriptFileNames: () => config.fileNames,
    getScriptVersion: () => String(version),
    getScriptSnapshot: (path) => {
      const text = path === file ? source : ts.sys.readFile(path);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: (path) => (path === file ? source : ts.sys.readFile(path)),
    readDirectory: ts.sys.readDirectory,
  };
  const service = ts.createLanguageService(host);
  const plugin = initialize({ typescript: ts }).create({
    languageService: service,
  } as ts.server.PluginCreateInfo);
  try {
    expect(service.getSemanticDiagnostics(file)).toEqual([]);
    const diagnostics = plugin
      .getSemanticDiagnostics(file)
      .filter((entry) => entry.source === "relkit");
    expect(diagnostics.length).toBeGreaterThan(0);
    const fix = plugin.getCodeFixesAtPosition(
      file,
      diagnostics[0]!.start!,
      diagnostics[0]!.start! + diagnostics[0]!.length!,
      [99001],
      {},
      {},
    )[0];
    expect(fix?.fixName).toBe("relkit-destructure-service-routes");
    const change = fix!.changes[0]!.textChanges[0]!;
    source =
      source.slice(0, change.span.start) +
      change.newText +
      source.slice(change.span.start + change.span.length);
    version++;
    expect(
      plugin.getSemanticDiagnostics(file).filter((entry) => entry.source === "relkit"),
    ).toEqual([]);
    expect(source).toContain("export const { GET }");
  } finally {
    service.dispose();
  }
}, 30_000);

test("the editor entry point loads through Node and TypeScript's plugin resolver", async () => {
  const node = Bun.which("node");
  expect(node).not.toBeNull();
  const root = await mkdtemp(join(tmpdir(), "relkit-editor-loader-"));
  await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
  await symlink(import.meta.dir, join(root, "node_modules/@relkit/cli"));
  try {
    const child = Bun.spawn(
      [
        node!,
        "-e",
        `const ts = require(${JSON.stringify(require.resolve("typescript"))});
const result = ts.sys.require(process.cwd(), "@relkit/cli/editor");
if (result.error) throw result.error;
if (typeof require("@relkit/cli/editor") !== "function") throw new Error("Invalid CommonJS entry");
process.stdout.write(typeof result.module);`,
      ],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [output, errors, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, errors).toBe(0);
    expect(output).toBe("function");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the packaged editor excludes test and fixture routes but diagnoses application routes", () => {
  const initialize = require("@relkit/cli/editor") as (modules: {
    typescript: typeof ts;
  }) => ts.server.PluginModule;
  const files = [
    "/app/src/routes/__fixtures__/route.ts",
    "/app/src/routes/users/__tests__/route.ts",
    "/app/src/routes/users/route.ts",
  ];
  const source = 'export const GET = "fixture data";';
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => ({ noLib: true }),
    getScriptFileNames: () => files,
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) =>
      files.includes(file) ? ts.ScriptSnapshot.fromString(source) : undefined,
    getCurrentDirectory: () => "/app",
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: (file) => files.includes(file),
    readFile: (file) => (files.includes(file) ? source : undefined),
  };
  const service = ts.createLanguageService(host);
  const plugin = initialize({ typescript: ts }).create({
    languageService: service,
  } as ts.server.PluginCreateInfo);
  try {
    for (const file of files.slice(0, 2)) {
      expect(plugin.getSemanticDiagnostics(file)).toEqual([]);
    }
    expect(plugin.getSemanticDiagnostics(files[2]!)).toContainEqual(
      expect.objectContaining({ source: "relkit", code: 99001 }),
    );
  } finally {
    service.dispose();
  }
});
