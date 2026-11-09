/** Every terminal failure prints its code, what happened, the next step and a docs link. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createDiagnostic, formatDiagnostic } from "relkit/diagnostics";
import { errorLines, runCli } from "./src/main.js";

const empty = await mkdtemp(join(tmpdir(), "relkit-error-presentation-"));
afterAll(() => rm(empty, { recursive: true, force: true }));

async function failure(argv: readonly string[]) {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const code = await runCli(argv, {
    installSignalHandlers: false,
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
  });
  return { code, stderr: stderr.join("\n").replaceAll(empty, "<empty>"), stdout };
}

test("creation errors", () => {
  const destination = join(empty, "app");
  const created = spawnSync(
    "bun",
    [
      "src/bin.ts",
      "create",
      "app",
      "--directory",
      destination,
      "--cloud",
      "aws",
      "--deploy",
      "pulumi",
      "--no-install",
      "--no-git",
      "--strict",
    ],
    { cwd: import.meta.dirname, encoding: "utf8" },
  );
  expect({
    code: created.status,
    stderr: created.stderr
      .replace(/RelKit [\d.]+ on Bun [\d.]+/u, "<versions>")
      .replace(/Tested: [^ ]+\./u, "Tested: <combinations>.")
      .trim(),
  }).toMatchSnapshot();
  expect(existsSync(join(destination, "package.json"))).toBe(false);
});

test("check errors", async () => {
  expect(await failure(["check", "--project-root", empty])).toMatchSnapshot();
  const diagnostic = createDiagnostic({
    code: "RELKIT_SCHEMA_UNAVAILABLE",
    severity: "error",
    message:
      "input cannot produce deterministic JSON Schema: Schema does not expose a deterministic projection.",
    file: "src/services/orders/functions/create-order.function.ts",
    line: 6,
    column: 3,
  });
  expect(formatDiagnostic(diagnostic, {})).toMatchSnapshot();
});

test("dev errors", async () => {
  expect(await failure(["dev", "--port", "70000"])).toMatchSnapshot();
});

test("deploy errors", async () => {
  expect(await failure(["deploy", "preview", "--project-root", empty])).toMatchSnapshot();
});

test("every RelKit code gets a docs link, known codes also get the next step", () => {
  expect(errorLines("RELKIT_DEV_USAGE", "Port must be between 0 and 65535.")).toEqual([
    "RELKIT_DEV_USAGE: Port must be between 0 and 65535.",
    expect.stringMatching(/^ {2}next: .+/u),
    "  docs: https://relkit.dev/docs/errors/relkit-dev-usage",
  ]);
  expect(
    errorLines(
      "RELKIT_CREATE_UNTESTED",
      "Untested. See https://relkit.dev/docs/modules/cli/relkit-create-untested",
    ).at(-1),
  ).toMatch(/^ {2}next: /u);
  expect(errorLines("EACCES", "Permission denied")).toEqual(["EACCES: Permission denied"]);
});
