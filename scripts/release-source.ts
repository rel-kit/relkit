/** Resolves immutable batch source and exact successful CI; current main only controls versioning and follow-up work. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import { automationCommand } from "./pr-automation-io.js";
import {
  MainReference,
  ReleaseRun,
  ReleaseRuns,
  ReleaseState,
} from "./release-automation.schemas.js";
import type { ReleaseApi } from "./release-automation.types.js";
import { verifyReleaseCi } from "./release-ci-verification.js";
import { validateReleasePlan, type ReleasePlan } from "./release-plan.js";

/**
 * Runs bounded Git data operations in the immutable workflow checkout.
 * @param root - Trusted repository checkout.
 * @param args - Literal Git arguments.
 * @param signal - Owning operation cancellation.
 * @returns Trimmed stdout; native failures remain visible.
 */
export async function releaseGit(root: string, args: readonly string[], signal: AbortSignal) {
  return (await automationCommand("git", args, root, signal)).trim();
}

/**
 * Finds the commit introducing this batch, rather than its last formatting edit.
 * @param root - Immutable workflow checkout.
 * @param plan - Current validated batch.
 * @param signal - Owning cancellation.
 * @returns Original source commit; same-version semantic plan edits are rejected.
 */
export async function releaseSource(root: string, plan: ReleasePlan, signal: AbortSignal) {
  const commits = (
    await releaseGit(
      root,
      ["log", "--first-parent", "--format=%H", "--", ".changeset/release.json"],
      signal,
    )
  ).split("\n");
  let source = "";
  const canonical = (value: ReleasePlan) => ({
    protocol: value.protocol,
    version: value.version,
    packages: value.packages
      .map(({ name, version }) => ({ name, version }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
  for (const commit of commits) {
    const previous = validateReleasePlan(
      JSON.parse(await releaseGit(root, ["show", `${commit}:.changeset/release.json`], signal)),
    );
    if (previous.version !== plan.version) break;
    assert.deepEqual(
      canonical(previous),
      canonical(plan),
      "A release plan changed without a new batch version",
    );
    source = commit;
  }
  assert.match(source, /^[a-f0-9]{40}$/, "Release plan has no introducing commit");
  return source;
}

/**
 * Detects real Changesets while allowing empty metadata-only entries.
 * @param root - Immutable workflow checkout.
 * @returns Whether a new batch needs versioning; malformed frontmatter fails.
 */
export async function pendingChangesets(root: string) {
  for (const name of await readdir(join(root, ".changeset"))) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const source = await readFile(join(root, ".changeset", name), "utf8");
    const frontmatter = /^---[^\S\n]*\r?\n([\s\S]*?)^---[^\S\n]*(?:\r?\n|$)/m.exec(source);
    assert.ok(frontmatter, `Invalid Changeset: ${name}`);
    const entries = Bun.YAML.parse(frontmatter[1]!);
    if (entries !== null && entries !== undefined && Object.keys(entries).length > 0) return true;
  }
  return false;
}

/**
 * Looks up public completion without interpreting a network error as an absent release.
 * @param root - Trusted checkout used by gh.
 * @param repository - Validated repository context.
 * @param version - Validated batch version.
 * @param signal - Owning cancellation.
 * @returns True only for a published GitHub release.
 */
export async function releaseComplete(
  root: string,
  repository: string,
  version: string,
  signal: AbortSignal,
) {
  const query =
    "query($owner: String!, $repo: String!, $tag: String!) { repository(owner: $owner, name: $repo) { release(tagName: $tag) { isDraft } } }";
  const json = await automationCommand(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-f",
      `owner=${repository.split("/")[0]}`,
      "-f",
      `repo=${repository.split("/")[1]}`,
      "-f",
      `tag=v${version}`,
    ],
    root,
    signal,
  );
  return (
    Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseState))(json).data.repository.release
      ?.isDraft === false
  );
}

/**
 * Checks the live reference without moving the workflow checkout.
 * @param repository - Validated repository context.
 * @param read - Bounded authenticated API adapter.
 * @returns Current main SHA, validated before it enters commands or outputs.
 */
export async function currentMain(repository: string, read: ReleaseApi) {
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(MainReference))(
    await read(`/repos/${repository}/git/ref/heads/main`),
  );
  assert.match(result.object.sha, /^[a-f0-9]{40}$/);
  return result.object.sha;
}

/**
 * Requires actual successful main CI for the selected source, including historical first packs.
 * @param repository - Validated repository context.
 * @param sha - Exact source commit.
 * @param read - Bounded authenticated API adapter.
 * @returns The verified run ID, or undefined while no successful CI exists.
 */
export async function successfulReleaseCi(repository: string, sha: string, read: ReleaseApi) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseRuns))(
    await read(
      `/repos/${repository}/actions/workflows/checks.yml/runs?branch=main&head_sha=${sha}&per_page=100`,
    ),
  );
  assert.equal(result.total_count, result.workflow_runs.length, "Truncated source CI history");
  const run = result.workflow_runs.find(
    (candidate) => candidate.status === "completed" && candidate.conclusion === "success",
  );
  if (!run) return undefined;
  const id = String(run.id);
  await verifyReleaseCi(repository, sha, id, async () =>
    Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseRun))(
      await read(`/repos/${repository}/actions/runs/${id}`),
    ),
  );
  return id;
}
