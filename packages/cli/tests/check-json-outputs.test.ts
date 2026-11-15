/** `relkit check --json` lists generated files by path and hash; `--include-outputs` adds their bodies. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";
import { runCli } from "../src/main.js";

registerCommandCleanup();

/** Runs `relkit` in process and returns the first stdout line parsed as JSON. */
async function json(argv: readonly string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
    installSignalHandlers: false,
  });
  return { code, stderr, line: stdout[0] ?? "", value: JSON.parse(stdout[0] ?? "null") };
}

const sha256 = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

test("check --json lists each generated file with its path, hash and size, without the body", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const result = await json(["--json", "check", "--project-root", root]);
  expect(result.code).toBe(0);
  expect(result.value.ok).toBe(true);
  expect(result.value.outputs.graph).toEqual({
    path: ".relkit/generated/application.graph.json",
    sha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    bytes: expect.any(Number),
  });
  // Outputs the check does not write to the generated directory have no path.
  expect(result.value.outputs.openapi).not.toHaveProperty("path");
  expect(result.value.outputs.openapi.sha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
  for (const entry of Object.values(result.value.outputs) as object[])
    expect(entry).not.toHaveProperty("content");
  expect(result.line.length).toBeLessThan(20_000);
  const onDisk = await readFile(join(root, result.value.outputs.graph.path), "utf8");
  expect(sha256(onDisk)).toBe(result.value.outputs.graph.sha256);
  expect(Buffer.byteLength(onDisk)).toBe(result.value.outputs.graph.bytes);
});

test("check --json --include-outputs also carries every body", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const result = await json(["--json", "check", "--include-outputs", "--project-root", root]);
  expect(result.code).toBe(0);
  const graph = result.value.outputs.graph;
  expect(sha256(graph.content)).toBe(graph.sha256);
  expect(JSON.parse(graph.content)).toMatchObject({ appId: expect.any(String) });
  expect(await readFile(join(root, graph.path), "utf8")).toBe(graph.content);
  expect(result.value.outputs.openapi.content).toContain('"openapi"');
});

test("--include-outputs belongs to check alone", async () => {
  const result = await json(["--json", "build", "--include-outputs"]);
  expect(result.code).toBe(2);
  expect(result.value.error.code).toBe("RELKIT_CLI_USAGE");
});
