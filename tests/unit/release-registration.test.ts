/** Exercises the required release workflow's registry preflight with disposable manifests and an npm shim, without publishing or using credentials. */
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmod, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Schema } from "effect";
import { withAutomationRepository } from "./pr-automation-fixture.ts";

const checkout = resolve(import.meta.dir, "../..");
const workflow = Schema.decodeUnknownSync(
  Schema.Struct({
    jobs: Schema.Struct({
      pack: Schema.Struct({
        steps: Schema.Array(
          Schema.Struct({
            name: Schema.optional(Schema.String),
            run: Schema.optional(Schema.String),
          }),
        ),
      }),
    }),
  }),
)(
  Bun.YAML.parse(await readFile(join(checkout, ".github/workflows/release-readiness.yml"), "utf8")),
);

/**
 * Runs the actual workflow step against a fixed registry response and captures every lookup.
 * @param manifest - Candidate package manifest, including malformed or empty fixtures.
 * @param missing - Package whose registry lookup must fail.
 * @returns Process result and the literal npm arguments used by the workflow.
 */
async function rehearse(manifest: string, missing = "") {
  const step = workflow.jobs.pack.steps.find(
    (entry) => entry.name === "Verify npm package registration",
  );
  const run = step?.run;
  if (!run) throw new Error("Release readiness must verify npm package registration");
  let result = { status: -1, stdout: "", stderr: "", calls: "" };
  await withAutomationRepository(
    {
      "rehearsal-pack/manifest.json": manifest,
      calls: "",
      "bin/npm": `#!${process.execPath}
import { appendFileSync } from "node:fs";
appendFileSync(process.env.LOOKUP_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
if (process.argv[3] === process.env.MISSING_PACKAGE + "@*") process.exit(1);
console.log(process.argv[3]);
`,
    },
    async ({ root }) => {
      await chmod(join(root, "bin/npm"), 0o755);
      const execution = spawnSync("/bin/bash", ["-e", "-c", run], {
        cwd: root,
        env: {
          PATH: `${join(root, "bin")}:${process.env.PATH}`,
          RUNNER_TEMP: root,
          LOOKUP_LOG: join(root, "calls"),
          MISSING_PACKAGE: missing,
        },
        encoding: "utf8",
        timeout: 10_000,
      });
      if (execution.error) throw execution.error;
      result = {
        status: execution.status ?? -1,
        stdout: execution.stdout,
        stderr: execution.stderr,
        calls: await readFile(join(root, "calls"), "utf8"),
      };
    },
  );
  return result;
}

const manifest = JSON.stringify({ packages: [{ name: "@relkit/api" }, { name: "relkit" }] });

test("release readiness checks every package against the public npm registry", async () => {
  const result = await rehearse(manifest);
  expect(result.status).toBe(0);
  expect(
    result.calls
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toEqual([
    ["view", "@relkit/api@*", "name", "--registry=https://registry.npmjs.org"],
    ["view", "relkit@*", "name", "--registry=https://registry.npmjs.org"],
  ]);
});

test("release readiness blocks missing packages and registry failures before merge", async () => {
  const result = await rehearse(manifest, "@relkit/api");
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("::error::Cannot verify npm package @relkit/api");
  expect(result.stdout).toContain("configure trusted publishing for ci.yml / environment npm");
  expect(result.calls.trim().split("\n")).toHaveLength(1);
});

test.each(["invalid JSON", JSON.stringify({ packages: [] })])(
  "release readiness rejects an unreadable or empty manifest: %s",
  async (content) => {
    const result = await rehearse(content);
    expect(result.status).not.toBe(0);
    expect(result.calls).toBe("");
  },
);
