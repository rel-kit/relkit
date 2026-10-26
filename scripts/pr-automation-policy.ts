/** Enforces repository, workflow, branch-head and artifact boundaries before constructing a compare-and-swap GitHub commit. */
import assert from "node:assert/strict";
import { dependencyUpdatePath } from "./dependency-update-policy.js";
import type { DependencyBundleData } from "./dependency-update.types.js";
import type {
  PreparationPullData,
  PreparationRunData,
  PreparedFile,
} from "./pr-automation.types.js";

/**
 * Admits only current PR runs; failed checks may need dependency normalization.
 * @param repository - Trusted workflow repository context.
 * @param run - GitHub's completed source run.
 * @param pull - Freshly fetched open PR data.
 * @returns Nothing, or throws before any write request is created.
 */
export function admitPreparation(
  repository: string,
  run: PreparationRunData,
  pull: PreparationPullData,
): void {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.equal(run.name, "CI");
  assert.equal(run.path, ".github/workflows/checks.yml");
  assert.equal(run.event, "pull_request");
  assert.equal(run.status, "completed");
  assert.ok(run.conclusion === "success" || run.conclusion === "failure");
  assert.equal(run.head_repository.full_name, repository);
  assert.equal(pull.state, "open");
  assert.equal(pull.base.repo.full_name, repository);
  assert.equal(pull.head.repo.full_name, repository);
  assert.equal(pull.base.ref, "main");
  assert.notEqual(pull.head.ref, "main");
  assert.notEqual(pull.head.ref, "changeset-release/main");
  assert.match(pull.head.sha, /^[a-f0-9]{40}$/);
  assert.match(pull.base.sha, /^[a-f0-9]{40}$/);
  assert.equal(pull.head.sha, run.head_sha, "PR head moved; a newer CI run owns preparation");
}

/**
 * Admits data from one exact producer; archive restorations require a later byte comparison with Git base.
 * @param bundle - Decoded read-only CI artifact.
 * @param repository - Trusted repository context.
 * @param head - Admitted PR head SHA.
 * @param tracked - Regular files in that Git tree; symlinks are deliberately excluded.
 * @returns Validated proposals without writing them to the trusted checkout.
 */
export function admitDependencyBundle(
  bundle: DependencyBundleData,
  repository: string,
  head: string,
  tracked: ReadonlySet<string>,
): readonly PreparedFile[] {
  assert.equal(bundle.repository, repository);
  assert.equal(bundle.head, head);
  assert.ok(bundle.files.length <= 250, "Too many normalized files");
  const unique = new Set<string>();
  for (const file of bundle.files) {
    assert.ok(tracked.has(file.path), `Untracked or nonregular file: ${file.path}`);
    assert.ok(!unique.has(file.path), `Duplicate normalized file: ${file.path}`);
    unique.add(file.path);
    assert.ok(
      dependencyUpdatePath(file.path) ||
        /^openspec\/changes\/archive\/.+\/package\.json$/.test(file.path),
      `Forbidden normalized path: ${file.path}`,
    );
    assert.ok(
      Buffer.byteLength(file.content) <= 8 * 1024 * 1024,
      "Normalized file exceeds size bound",
    );
  }
  return bundle.files;
}

/**
 * Creates an atomic server-side branch update that refuses a concurrent push.
 * @param repository - Admitted repository.
 * @param pull - Admitted current PR identity.
 * @param files - Changeset and validated dependency proposals.
 * @returns GraphQL request data; callers submit it only after all preparation succeeds.
 */
export function preparationCommit(
  repository: string,
  pull: PreparationPullData,
  files: readonly PreparedFile[],
) {
  assert.ok(files.length > 0, "An empty preparation must not create a commit");
  return {
    query:
      "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }",
    variables: {
      input: {
        branch: { repositoryNameWithOwner: repository, branchName: pull.head.ref },
        expectedHeadOid: pull.head.sha,
        message: { headline: "chore: prepare dependencies and release changeset" },
        fileChanges: {
          additions: files.map(({ path, content }) => ({
            path,
            contents: Buffer.from(content).toString("base64"),
          })),
        },
      },
    },
  };
}
