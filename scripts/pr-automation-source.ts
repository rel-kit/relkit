/** Reads PR trees as Git objects while trusted base code stays checked out; returned proposals contain data only. */
import assert from "node:assert/strict";
import { Schema } from "effect";
import {
  affectedPackages,
  changesetPackages,
  isChangeset,
  renderChangeset,
} from "./auto-changeset.js";
import { DependencyManifest } from "./dependency-update.schemas.js";
import { automationCommand } from "./pr-automation-io.js";
import type { PreparationPullData, PreparedFile } from "./pr-automation.types.js";

/**
 * Lists only regular files; symlink blobs are never treated as manifests or writable output.
 * @param root - Trusted checkout containing fetched PR objects.
 * @param head - Exact admitted SHA.
 * @param signal - Owning preparation cancellation.
 * @returns Repository-relative regular file paths.
 */
export async function regularGitFiles(
  root: string,
  head: string,
  signal: AbortSignal,
): Promise<Set<string>> {
  assert.match(head, /^[a-f0-9]{40}$/);
  const tree = await automationCommand("git", ["ls-tree", "-r", "-z", head], root, signal);
  return new Set(
    tree.split("\0").flatMap((entry) => {
      const match = /^100(?:644|755) blob [a-f0-9]{40}\t([\s\S]+)$/.exec(entry);
      return match ? [match[1]!] : [];
    }),
  );
}

/**
 * Computes uncovered packages from PR data without checking out or executing its code.
 * @param root - Trusted base checkout.
 * @param pull - Admitted PR identity.
 * @param files - Regular files at the admitted head.
 * @param updates - Validated dependency proposals included in this same commit.
 * @param signal - Owning preparation cancellation.
 * @returns At most one new changeset; existing authored changesets are preserved.
 */
export async function preparedChangeset(
  root: string,
  pull: PreparationPullData,
  files: ReadonlySet<string>,
  updates: readonly PreparedFile[],
  signal: AbortSignal,
): Promise<readonly PreparedFile[]> {
  const read = (path: string) =>
    automationCommand("git", ["show", `${pull.head.sha}:${path}`], root, signal);
  const paths = (
    await automationCommand(
      "git",
      ["diff", "--no-renames", "--name-only", "-z", `${pull.base.sha}...${pull.head.sha}`],
      root,
      signal,
    )
  )
    .split("\0")
    .filter(Boolean);
  const packages = new Map<string, string>();
  const covered = new Set<string>();
  for (const path of files) {
    if (
      !/^(?:packages\/[a-z0-9-]+|integrations\/catalog|integrations\/packages\/[a-z0-9-]+)\/package\.json$/.test(
        path,
      )
    )
      continue;
    const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(DependencyManifest))(
      await read(path),
    );
    if (manifest.private !== true && manifest.name) {
      assert.match(
        manifest.name,
        /^(?:@relkit\/[a-z0-9-]+|create-relkit|relkit)$/,
        "Unsupported publishable package name",
      );
      packages.set(path.slice(0, -13), manifest.name);
    }
  }
  for (const path of paths.filter((path) => files.has(path) && isChangeset(path))) {
    for (const name of changesetPackages(await read(path))) covered.add(name);
  }
  const affected = affectedPackages(
    [...paths, ...updates.map((file) => file.path)],
    packages,
  ).filter((name) => !covered.has(name));
  if (affected.length === 0) return [];
  const path = `.changeset/auto-pr-${pull.number}-${pull.head.sha.slice(0, 12)}.md`;
  assert.ok(!files.has(path), "Generated changeset path already exists");
  const summary =
    pull.title.trim().replace(/\s+/g, " ") || `Release changes from PR #${pull.number}.`;
  return [{ path, content: renderChangeset(affected, summary) }];
}

/**
 * Requires evidence corrections to exactly restore the merge-base bytes.
 * @param root - Trusted base checkout containing both commits.
 * @param pull - Admitted PR identity.
 * @param updates - Validated dependency proposals.
 * @param signal - Owning preparation cancellation.
 * @returns Completion or a failure before constructing a commit.
 */
export async function verifyEvidenceRestoration(
  root: string,
  pull: PreparationPullData,
  updates: readonly PreparedFile[],
  signal: AbortSignal,
): Promise<void> {
  const ancestor = (
    await automationCommand("git", ["merge-base", pull.base.sha, pull.head.sha], root, signal)
  ).trim();
  for (const update of updates.filter((file) =>
    file.path.startsWith("openspec/changes/archive/"),
  )) {
    const original = await automationCommand(
      "git",
      ["show", `${ancestor}:${update.path}`],
      root,
      signal,
    );
    assert.equal(
      update.content,
      original,
      "Archived evidence may only be restored, never regenerated",
    );
  }
}
