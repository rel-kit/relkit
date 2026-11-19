/**
 * A deprecated authoring option is still accepted and the editor marks it: in the suggestion list
 * its entry carries the `deprecated` modifier, which an editor draws struck through, and its
 * hover text says why. TypeScript does not mark a key that is already written in an object
 * literal, so that is not asserted. Measured with TypeScript 5.9's language service.
 */
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "bun:test";
import type TypeScript from "typescript";

const root = resolve(import.meta.dir, "../..");
const ts = createRequire(join(root, "apps/docs/package.json"))("typescript") as typeof TypeScript;
const project = join(import.meta.dir, "tsconfig.json");
const file = join(import.meta.dir, "fixture/deprecated-option.task.ts");
const text = `import { defineTask } from "relkit/tasks";
import { s } from "relkit/schema";

export default defineTask({
  id: "orders.archive",
  version: "1",
  input: s.object({}),
  output: s.object({ done: s.boolean() }),
  logging: { level: "info", redact: ["input.token"] },
  handler: async () => ({ done: true }),
});

export const other = defineTask({
  id: "orders.purge",
  version: "1",
  input: s.object({}),
  output: s.object({ done: s.boolean() }),
  /*options*/
  handler: async () => ({ done: true }),
});
`;

test("logging of defineTask is accepted and marked as deprecated", () => {
  expect(ts.version.startsWith("5.")).toBe(true);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    project,
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
  )!;
  const service = ts.createLanguageService({
    getScriptFileNames: () => [...parsed.fileNames, file],
    getScriptVersion: () => "0",
    getScriptSnapshot: (name) => {
      const content = name === file ? text : ts.sys.readFile(name);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => dirname(project),
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (name) => name === file || ts.sys.fileExists(name),
    readFile: (name) => (name === file ? text : ts.sys.readFile(name)),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    ...(ts.sys.realpath === undefined ? {} : { realpath: ts.sys.realpath }),
  });
  const message = (diagnostic: TypeScript.Diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  expect(service.getSemanticDiagnostics(file).map(message)).toEqual([]);
  const key = text.indexOf("logging:");
  const entries =
    service.getCompletionsAtPosition(file, text.indexOf("/*options*/"), {})?.entries ?? [];
  const modifiers = (name: string) =>
    entries.find((entry) => entry.name === name)?.kindModifiers?.split(",") ?? [];
  expect(modifiers("logging")).toContain("deprecated");
  expect(modifiers("maxDuration")).not.toContain("deprecated");
  const hover = service.getQuickInfoAtPosition(file, key + 1);
  expect(hover?.tags?.find((tag) => tag.name === "deprecated")?.text?.[0]?.text).toContain(
    "has no effect and will be removed",
  );
}, 120_000);
