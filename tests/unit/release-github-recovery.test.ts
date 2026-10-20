import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workflow = Bun.YAML.parse(
  await Bun.file(join(import.meta.dir, "../../.github/workflows/ci.yml")).text(),
);
const steps = workflow.jobs.publish.steps;
const publish = steps.find(
  (step: { name?: string }) => step.name === "Publish the immutable GitHub release",
);

test("only recovery requests workflow authority, after npm verification", () => {
  const recovery = steps.find((step: { id?: string }) => step.id === "recovery-app");
  expect(recovery?.if).toBe("needs.select-release-mode.outputs.mode == 'recover'");
  expect(recovery.with["permission-contents"]).toBe("write");
  expect(recovery.with["permission-workflows"]).toBe("write");
  expect(steps.indexOf(recovery)).toBeGreaterThan(
    steps.findIndex(
      (step: { name?: string }) =>
        step.name === "Publish missing original archives in dependency order",
    ),
  );
  expect(steps.indexOf(recovery)).toBeLessThan(steps.indexOf(publish));
  expect(publish.env.GH_TOKEN).toBe("${{ steps.recovery-app.outputs.token || github.token }}");
  const versionToken = workflow.jobs.version.steps.find(
    (step: { id?: string }) => step.id === "release-app",
  );
  expect(versionToken.with["permission-workflows"]).toBeUndefined();
  expect(workflow.jobs.publish.permissions["id-token"]).toBe("write");
});

test.each([
  ["v0.7.11", "false"],
  ["v0.7.9", "true"],
  ["v0.7.10", "true"],
  ["", "true"],
])("publishing 0.7.10 with latest %s sets latest=%s", async (latest, expected) => {
  const root = await mkdtemp(join(tmpdir(), "relkit-github-recovery-"));
  try {
    await mkdir(join(root, "npm-release"));
    await writeFile(join(root, "npm-release/manifest.json"), JSON.stringify({ version: "0.7.10" }));
    await writeFile(
      join(root, "gh"),
      `#!${process.execPath}\n` +
        String.raw`
      import { appendFileSync } from "node:fs";
      const args = process.argv.slice(2);
      appendFileSync(process.env.CALLS, JSON.stringify(args) + "\n");
      if (args[0] === "release" && args[1] === "view") process.exit(1);
      if (args[0] === "api") console.log(process.env.LATEST);
    `,
    );
    await chmod(join(root, "gh"), 0o700);
    execFileSync("bash", ["-e", "-c", publish.run], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        CALLS: join(root, "calls.jsonl"),
        LATEST: latest,
        GITHUB_REPOSITORY: "rel-kit/relkit",
        RELEASE_SHA: "a".repeat(40),
      },
    });
    const calls: string[][] = (await readFile(join(root, "calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls.find((args) => args[1] === "create")).toContain("a".repeat(40));
    expect(calls.find((args) => args[1] === "edit")).toContain(`--latest=${expected}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
