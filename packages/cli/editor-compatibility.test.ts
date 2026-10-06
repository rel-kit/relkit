import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);

test("the packaged plugin uses the editor's TypeScript for dynamic route inputs and recovery", async () => {
  const repository = resolve(import.meta.dir, "../..");
  await mkdir(join(repository, ".relkit"), { recursive: true });
  const root = await mkdtemp(join(repository, ".relkit/editor-typescript-"));
  let service: ts.LanguageService | undefined;
  try {
    await mkdir(join(root, "src/routes/users/[id]"), { recursive: true });
    await mkdir(join(root, "src/users"), { recursive: true });
    // Fresh workspace installs do not hoist the generated app's @relkit/app dependency.
    await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
    await symlink(join(repository, "packages/app"), join(root, "node_modules/@relkit/app"));
    const functionFile = join(root, "src/users/example.function.ts");
    const routeFile = join(root, "src/routes/users/[id]/route.ts");
    const valid = `import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({ input: z.object({ value: z.string(), id: z.string() }),
output: z.object({ value: z.string() }), handler: async ({ value }) => ({ value }) });`;
    await writeFile(functionFile, valid);
    await writeFile(
      join(root, "src/users/service.ts"),
      `import { defineService } from "@relkit/app/services";
import example from "./example.function.js";
export default defineService({ functions: { example } });`,
    );
    const inferredRoute = `import service from "../../../users/service.js";
import { defineServiceRoutes, http } from "@relkit/app/routes";
export const { GET } = defineServiceRoutes(service, { GET: { member: "example" } });`;
    let routeSource = inferredRoute;
    await writeFile(routeFile, routeSource);
    let source = valid.replace(", id: z.string()", "");
    let version = 0;
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: ["bun"],
    };
    service = ts.createLanguageService({
      getCompilationSettings: () => options,
      getScriptFileNames: () => [routeFile, functionFile],
      getScriptVersion: () => String(version),
      getScriptSnapshot: (file) => {
        const text =
          file === functionFile ? source : file === routeFile ? routeSource : ts.sys.readFile(file);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => root,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
    });
    const initialize = require("@relkit/cli/editor") as typeof import("./src/editor.js").default;
    // The plugin consumes only languageService, which owns these mutable snapshots.
    const plugin = initialize({ typescript: ts }).create({
      languageService: service,
    } as ts.server.PluginCreateInfo);
    const findings = () =>
      plugin
        .getSemanticDiagnostics(routeFile)
        .filter((diagnostic: ts.Diagnostic) => diagnostic.source === "relkit");
    expect(findings().map((diagnostic: ts.Diagnostic) => diagnostic.messageText)).toContain(
      'Route GET infers path input "id", but the target function input schema does not declare it. Add the input field or define an explicit request mapping.',
    );
    source = valid;
    version++;
    expect(findings()).toEqual([]);
    source = valid.replace(", id: z.string()", "");
    routeSource = inferredRoute.replace(
      'member: "example"',
      'member: "example", request: http.input({ value: http.path("id") })',
    );
    version++;
    expect(findings()).toEqual([]);
    routeSource = routeSource.replace("export const { GET }", "export const GET");
    version++;
    expect(
      findings().some((diagnostic: ts.Diagnostic) =>
        String(diagnostic.messageText).includes("returns a method table"),
      ),
    ).toBe(true);
  } finally {
    service?.dispose();
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
