import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repository = process.cwd();
const output = dirname(fileURLToPath(import.meta.url));
const relative = "packages/cli/src/commands/dev-inspector-support.service.ts";
const target = resolve(relative);
const files = [relative, "packages/cli/tests/services/inspector-readiness.test.ts",
  "packages/cli/inspector-startup.test.ts", "packages/cli/tests/dev-environment/recovery-process.ts",
  "tests/inspector/reload-recovery.probe.ts", "scripts/test-inspector-recovery-fixture.ts"];
const base = JSON.parse(readFileSync("tsconfig.base.json", "utf8"));
const converted = ts.convertCompilerOptionsFromJson(base.compilerOptions, repository);
assert.equal(converted.errors.length, 0);
const options = { ...converted.options, noEmit: true, composite: false,
  declaration: false, declarationMap: false, sourceMap: false };
const original = execFileSync("git", ["show", `HEAD:${relative}`], { encoding: "utf8" })
  .replace("const waitInspectorReady =", "export const waitInspectorReady =");

function check(baseline) {
  const host = ts.createCompilerHost(options);
  const read = host.readFile;
  if (baseline) host.readFile = (file) => resolve(file) === target ? original : read(file);
  const program = ts.createProgram(files.map((file) => resolve(file)), options, host);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    file: diagnostic.file?.fileName.replace(`${repository}/`, ""),
    line: diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : undefined,
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }));
}

const baseline = check(true);
global.gc?.();
const current = check(false);
const keys = new Set(baseline.map((item) => JSON.stringify(item)));
const introduced = current.filter((item) => !keys.has(JSON.stringify(item)));
const editedFileErrors = current.filter((item) => files.includes(item.file));
for (const [name, value] of Object.entries({ baseline, current,
  comparison: { baselineErrors: baseline.length, currentErrors: current.length,
    introduced, editedFileErrors } })) {
  writeFileSync(resolve(output, `typecheck-${name}.json`), JSON.stringify(value, null, 2) + "\n");
}
console.log(JSON.stringify({ baselineErrors: baseline.length, currentErrors: current.length,
  introduced: introduced.length, editedFileErrors: editedFileErrors.length }));
assert.equal(introduced.length, 0);
assert.equal(editedFileErrors.length, 0);
