import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findReleaseRecovery, recoverRelease } from "./release-recovery.ts";
import { readReleasePlan } from "./release-plan.ts";

const root = resolve(import.meta.dirname, "..");
const repository = process.env.GITHUB_REPOSITORY;
assert.ok(repository && /^[\w.-]+\/[\w.-]+$/.test(repository));
const gh = (args: string[]) => execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 });
const read = async (path: string) => JSON.parse(gh(["api", "--hostname", "github.com", path]));
const output = (values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) console.log(`${name}=${value}`);
};
if (process.env.RECOVERY_RUN_ID) {
  const recovery = await recoverRelease(repository, process.env.RECOVERY_RUN_ID, read);
  execFileSync("git", ["merge-base", "--is-ancestor", recovery.sha, "HEAD"], { cwd: root });
  output({
    mode: "recover",
    sha: recovery.sha,
    artifact_id: recovery.artifactId,
    artifact_run_id: recovery.runId,
  });
} else {
  const sha = process.env.VERIFIED_SHA;
  assert.ok(sha && /^[a-f0-9]{40}$/.test(sha), "A verified CI commit is required");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (head !== sha) {
    console.error(`::notice::Main advanced beyond ${sha}; its superseded release run is skipped`);
    output({ mode: "none", sha });
  } else {
    const pending = readdirSync(resolve(root, ".changeset")).some((name) => {
      if (!name.endsWith(".md") || name === "README.md") return false;
      const source = readFileSync(resolve(root, ".changeset", name), "utf8");
      const frontmatter = /^---[^\S\n]*\r?\n([\s\S]*?)^---[^\S\n]*(?:\r?\n|$)/m.exec(source);
      assert.ok(frontmatter, `Invalid Changeset: ${name}`);
      const entries = Bun.YAML.parse(frontmatter[1]!);
      return entries !== null && entries !== undefined && Object.keys(entries).length > 0;
    });
    const plan = await readReleasePlan(root);
    let mode = pending ? "version" : plan ? "publish" : "none";
    if (plan) {
      const query =
        "query($owner: String!, $repo: String!, $tag: String!) { repository(owner: $owner, name: $repo) { release(tagName: $tag) { isDraft } } }";
      const result = JSON.parse(
        gh([
          "api",
          "graphql",
          "-f",
          `query=${query}`,
          "-f",
          `owner=${repository.split("/")[0]}`,
          "-f",
          `repo=${repository.split("/")[1]}`,
          "-f",
          `tag=v${plan.version}`,
        ]),
      );
      const complete = result.data.repository.release?.isDraft === false;
      if (complete && !pending) mode = "none";
      if (!complete && pending)
        throw new Error(
          "Finish the previous release with recovery_run_id before versioning another batch",
        );
      // A plan belongs to its version commit. Later docs commits must use artifact recovery.
      const changes = execFileSync(
        "git",
        ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD^", "HEAD"],
        { cwd: root, encoding: "utf8" },
      );
      if (!changes.split("\n").includes(".changeset/release.json") && mode === "publish")
        throw new Error(
          "Unfinished earlier release: dispatch Release with recovery_run_id to reuse its original archives",
        );
    }
    const recovery =
      mode === "publish"
        ? await findReleaseRecovery(repository, sha, process.env.GITHUB_RUN_ID ?? "", read)
        : undefined;
    if (recovery)
      output({
        mode: "recover",
        sha: recovery.sha,
        artifact_id: recovery.artifactId,
        artifact_run_id: recovery.runId,
      });
    else output({ mode, sha });
  }
}
