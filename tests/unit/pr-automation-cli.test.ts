/** Exercises the real automation entry points: stdout carries data, stderr carries diagnostics, and caller-selected paths remain untouched. */
import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Schema } from "effect";
import { installAutomationCommands, withAutomationRepository } from "./pr-automation-fixture.ts";

const execute = promisify(execFile);
const checkout = resolve(import.meta.dir, "../..");

/**
 * Runs the actual CLI with finite process ownership and separately captured protocol/diagnostic streams.
 * @param script - Repository-owned automation executable.
 * @param args - Literal command arguments.
 * @param env - Scenario-specific runtime values, without network credentials.
 * @returns Complete stdout and stderr after successful exit.
 */
async function invoke(script: string, args: readonly string[], env: Record<string, string>) {
  return execute(process.execPath, [join(checkout, "scripts", script), ...args], {
    cwd: checkout,
    env: { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "", ...env },
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

test("dependency export emits parseable JSON instead of writing an argument-selected file", async () => {
  await withAutomationRepository({ sentinel: "preserve\n" }, async ({ root }) => {
    const output = join(root, "sentinel");
    await installAutomationCommands(root, {});
    const { stdout, stderr } = await invoke("dependency-update.ts", ["--export", output], {
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      GITHUB_REPOSITORY: "rel-kit/relkit",
      GITHUB_OUTPUT: output,
      RUNNER_TEMP: output,
    });
    expect(JSON.parse(stdout)).toMatchObject({ repository: "rel-kit/relkit" });
    expect(stderr).toContain("Dependency preparation completed");
    expect(await readFile(output, "utf8")).toBe("preserve\n");
  });
});

/**
 * Supplies a completed CI run and an optional current PR without contacting GitHub.
 * @param base - Fixture's trusted base commit.
 * @param head - Fixture's candidate commit.
 * @param open - Whether the current PR is still eligible for preparation.
 * @returns Serialized API responses for the real CLI adapter.
 */
function preparationResponses(base: string, head: string, open: boolean) {
  const repository = { full_name: "rel-kit/relkit" };
  const pull = {
    number: 1,
    title: "Update API",
    state: "open",
    user: { login: "contributor" },
    base: { sha: base, ref: "main", repo: repository },
    head: { sha: head, ref: "fix/example", repo: repository },
  };
  return {
    "/repos/rel-kit/relkit/actions/runs/1": JSON.stringify({
      id: 1,
      run_attempt: 1,
      name: "CI",
      path: ".github/workflows/checks.yml",
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      head_sha: head,
      head_repository: repository,
    }),
    [`/repos/rel-kit/relkit/commits/${head}/pulls?per_page=100`]: JSON.stringify(
      open ? [pull] : [],
    ),
    "/repos/rel-kit/relkit/pulls/1": JSON.stringify(pull),
  };
}

/**
 * Executes the workflow's actual capture step after proving the CLI cannot select output files.
 * @param root - Disposable runner directory that owns the output files.
 * @param env - Isolated command shims and disposable runner paths.
 * @param expected - Exact machine output previously observed from the CLI.
 * @returns Completion after checking the request file and changed output used by the token step.
 */
async function verifyWorkflowCapture(root: string, env: Record<string, string>, expected: string) {
  const workflow = Schema.decodeUnknownSync(
    Schema.Struct({
      jobs: Schema.Struct({
        prepare: Schema.Struct({
          steps: Schema.Array(
            Schema.Struct({
              id: Schema.optional(Schema.String),
              run: Schema.optional(Schema.String),
            }),
          ),
        }),
      }),
    }),
  )(Bun.YAML.parse(await readFile(join(checkout, ".github/workflows/prepare-pr.yml"), "utf8")));
  const plan = workflow.jobs.prepare.steps.find((step) => step.id === "plan");
  if (!plan?.run) throw new Error("Preparation workflow must contain its executable plan step");
  await execute("/bin/bash", ["-e", "-c", plan.run], {
    cwd: checkout,
    env: { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "", ...env },
    timeout: 10_000,
  });
  expect(await readFile(join(root, "pr-preparation.json"), "utf8")).toBe(expected);
  expect(await readFile(join(root, "sentinel"), "utf8")).toBe(
    expected ? "preserve\nchanged=true\n" : "preserve\n",
  );
}

test.each([false, true])(
  "PR preparation changed=%s keeps all output paths in the workflow",
  async (changed) => {
    await withAutomationRepository(
      {
        "packages/api/package.json": JSON.stringify({ name: "@relkit/api", version: "1.0.0" }),
        "packages/api/src/index.ts": "export const value = 1;\n",
        sentinel: "preserve\n",
      },
      async ({ root, base, write, commit }) => {
        await write("packages/api/src/index.ts", "export const value = 2;\n");
        const head = commit();
        await installAutomationCommands(root, preparationResponses(base, head, changed));
        const env = {
          PATH: `${join(root, "bin")}:${process.env.PATH}`,
          GITHUB_REPOSITORY: "rel-kit/relkit",
          CI_RUN_ID: "1",
          GITHUB_OUTPUT: join(root, "sentinel"),
          RUNNER_TEMP: root,
        };
        const { stdout, stderr } = await invoke("pr-automation.ts", [], env);
        expect(stderr).toContain("Pull request preparation completed");
        expect(await readFile(join(root, "sentinel"), "utf8")).toBe("preserve\n");
        expect(await Bun.file(join(root, "pr-preparation.json")).exists()).toBe(false);
        if (changed) expect(JSON.parse(stdout).variables.input.expectedHeadOid).toBe(head);
        else expect(stdout).toBe("");
        await verifyWorkflowCapture(root, env, stdout);
      },
    );
  },
);
