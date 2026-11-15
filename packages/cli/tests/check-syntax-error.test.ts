/**
 * A file that does not parse is reported by `relkit check` at the parse error's own line and
 * column, with the parser's message and no absolute path, on Bun (in process, the evaluator child
 * runs on Bun) and on Node (the built CLI, whose evaluator child loads TypeScript through the
 * CLI's esbuild hooks).
 */
import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../src/main.js";
import { nodeCli } from "./database/fixture.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

const FILE = "src/hello/functions/hello.function.ts";

/**
 * Copies the minimal fixture and appends a line that does not parse to its function file.
 * @returns The project root and the one-based line of the syntax error.
 */
async function brokenProject(): Promise<{ root: string; line: number }> {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const path = join(root, FILE);
  const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
  lines.push("", "const broken: = ;", "");
  await writeFile(path, lines.join("\n"));
  return { root, line: lines.length - 1 };
}

/**
 * Asserts the one diagnostic of a check of the broken project.
 * @param stdout - JSON output of `relkit --json check`.
 * @param root - Project root, which must not appear in the output.
 * @param line - Line of the syntax error.
 * @param message - The parser's own message on this runtime.
 */
function expectSyntaxDiagnostic(stdout: string, root: string, line: number, message: string) {
  const diagnostics = JSON.parse(stdout).diagnostics;
  expect(JSON.stringify(diagnostics)).not.toContain(root);
  expect(diagnostics).toEqual([
    expect.objectContaining({
      code: "RELKIT_EVALUATOR_IMPORT_FAILED",
      file: FILE,
      line,
      column: 15,
      message: expect.stringMatching(new RegExp(`^${message}`, "u")),
    }),
  ]);
  expect(diagnostics[0].message).not.toContain("errors building");
}

test("check on Bun reports a syntax error at its own location with the parser's message", async () => {
  const { root, line } = await brokenProject();
  const stdout: string[] = [];
  const code = await runCli(["--json", "check", "--project-root", root], {
    cwd: root,
    installSignalHandlers: false,
    io: { stdout: (entry) => stdout.push(entry), stderr: () => undefined },
  });
  expect(code).not.toBe(0);
  expectSyntaxDiagnostic(stdout.join("\n"), root, line, "Unexpected =");
  expect(JSON.parse(stdout.join("\n")).diagnostics[0].message).toContain(`${line}:17 Unexpected ;`);
}, 60_000);

test("check on Node reports a syntax error at its own location with the parser's message", async () => {
  const { root, line } = await brokenProject();
  const result = await nodeCli(root, ["--json", "check"]);
  expect(result.code).not.toBe(0);
  expectSyntaxDiagnostic(result.stdout, root, line, 'Unexpected "="');
  const text = await nodeCli(root, ["check"]);
  expect(`${text.stdout}${text.stderr}`).toContain(
    `${FILE}:${line}:15 - error RELKIT_EVALUATOR_IMPORT_FAILED: Unexpected "="`,
  );
  expect(`${text.stdout}${text.stderr}`).not.toContain(root);
}, 60_000);
