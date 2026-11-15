/**
 * The Node creation smoke names each step, times it, and when one fails reports the command's
 * output; its package-manager command lines and the candidate-install proof are fixed here
 * because the run itself needs a packed registry and two minutes per manager.
 */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCandidateInstalled } from "../../scripts/node-creation-candidate.ts";
import {
  commands,
  expectOutput,
  fail,
  step,
  StepFailure,
  summarize,
  type Project,
  type StepResult,
} from "../../scripts/node-creation-steps.ts";

const npm: Project = { manager: "npm", directory: "/project", env: {} };
const pnpm: Project = { manager: "pnpm", directory: "/project", env: {} };

test("scripts and the project's relkit binary are invoked per package manager", () => {
  expect(commands(npm).script("inspector", ["--port", "1"])).toEqual([
    "npm",
    "run",
    "inspector",
    "--",
    "--port",
    "1",
  ]);
  expect(commands(npm).script("check")).toEqual(["npm", "run", "check"]);
  expect(commands(npm).relkit(["add", "database"])).toEqual([
    "npx",
    "--no",
    "relkit",
    "add",
    "database",
  ]);
  expect(commands(pnpm).script("inspector", ["--port", "1"])).toEqual([
    "pnpm",
    "run",
    "inspector",
    "--port",
    "1",
  ]);
  expect(commands(pnpm).relkit(["check"])).toEqual(["pnpm", "exec", "relkit", "check"]);
});

test("a failing step is recorded and its error names the step and the command output", async () => {
  const results: StepResult[] = [];
  expect(await step(results, "first", async () => 7)).toBe(7);
  const failure = await step(results, "second", async () =>
    fail(
      "npm run check",
      { code: 1, signal: null, output: "boom\nRELKIT_X at file:1:1" },
      "Expected 0.",
    ),
  ).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(StepFailure);
  expect((failure as Error).message).toContain('Step "second" failed: Expected 0.');
  expect((failure as Error).message).toContain("$ npm run check (exit status 1)");
  expect((failure as Error).message).toContain("RELKIT_X at file:1:1");
  expect(results.map(({ name, ok }) => [name, ok])).toEqual([
    ["first", true],
    ["second", false],
  ]);
  expect(summarize(results).split("\n")).toEqual([
    expect.stringMatching(/^ok\s+\d+\.\ds {2}first$/),
    expect.stringMatching(/^FAIL\s+\d+\.\ds {2}second$/),
  ]);
});

test("a signal is reported instead of an exit status and output is quoted from its end", () => {
  const output = `${"x".repeat(10_000)}TAIL`;
  expect(() => fail("c", { code: null, signal: "SIGKILL", output }, "why")).toThrow(
    /signal SIGKILL[\s\S]*TAIL$/,
  );
  expect(() => expectOutput(["c"], { code: 0, signal: null, output: "a" }, /b/, "needs b")).toThrow(
    /needs b \(missing \/b\/\)/,
  );
  expect(() =>
    expectOutput(["c"], { code: 0, signal: null, output: "abc" }, "b", "x"),
  ).not.toThrow();
});

test("the lockfile must resolve the package from the candidate registry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-candidate-test-"));
  try {
    const manifest = { name: "@relkit/cli", version: "0.9.0" };
    const candidate = {
      directory,
      index: { workspace: ["@relkit/cli"], packages: [{ manifest, tarball: "0.tgz" }] },
      registryUrl: "http://127.0.0.1:1234",
    } as never;
    const project: Project = { manager: "npm", directory, env: {} };
    const lockfile = join(directory, "package-lock.json");
    await writeFile(lockfile, '{"resolved":"http://127.0.0.1:1234/_tar/%40relkit%2Fcli"}');
    await expect(
      assertCandidateInstalled(candidate, project, ["@relkit/cli"]),
    ).resolves.toBeUndefined();
    await writeFile(
      lockfile,
      '{"resolved":"https://registry.npmjs.org/@relkit/cli/-/cli-0.9.0.tgz"}',
    );
    await expect(assertCandidateInstalled(candidate, project, ["@relkit/cli"])).rejects.toThrow(
      /not resolved from the packed candidate/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
