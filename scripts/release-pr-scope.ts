/**
 * Decides whether a pull request is the generated release pull request and changes only files that
 * versioning derives. CI skips its slowest measurements only then; any other path keeps the full
 * suite.
 *
 *   git diff --name-only "$BASE_SHA" "$HEAD_SHA" | node --experimental-strip-types scripts/release-pr-scope.ts
 */
import { readFileSync } from "node:fs";

/** Branch the release GitHub App writes the versioned candidate to. */
export const RELEASE_BRANCH = "changeset-release/main";

/** Every path `bun run version:packages` writes. A path outside this list keeps the full suite. */
export const VERSION_DERIVED_PATHS: readonly RegExp[] = [
  /^\.changeset\/[^/]+\.md$/u,
  /^\.changeset\/release\.json$/u,
  /^(?:CHANGELOG|RELEASE_NOTES)\.md$/u,
  /^bun\.lock$/u,
  /^(?:packages|integrations\/packages)\/[^/]+\/(?:package\.json|CHANGELOG\.md)$/u,
  /^packages\/create-relkit\/src\/create-capabilities\.ts$/u,
  /^templates\/[^/]+\/README\.md$/u,
  /^templates\/[^/]+\/v\d+\/[^/]+\/package\.json$/u,
  /^docs\/evidence\/create-capabilities\/[^/]+\.md$/u,
  /^apps\/docs\/content\/_snippets\/(?:generated|source)\/.+$/u,
  /^apps\/docs\/content\/docs\/api\/cli\.mdx$/u,
];

/** What CI knows about a pull request before it chooses the suite. */
export interface ReleasePullRequest {
  /** Head branch name. */
  readonly headRef: string;
  /** Repository that owns the head branch. */
  readonly headRepository: string;
  /** Repository the workflow runs in. */
  readonly repository: string;
  /** Paths that differ between the base and the head. */
  readonly paths: readonly string[];
}

/**
 * Tells the generated release pull request from every other pull request.
 * @param pull - Head branch, its repository, and the changed paths.
 * @returns True only for this repository's release branch with a non-empty, version-derived diff.
 */
export function versionOnlyRelease(pull: ReleasePullRequest): boolean {
  return (
    pull.headRef === RELEASE_BRANCH &&
    pull.headRepository !== "" &&
    pull.headRepository === pull.repository &&
    pull.paths.length > 0 &&
    pull.paths.every((path) => VERSION_DERIVED_PATHS.some((pattern) => pattern.test(path)))
  );
}

if (import.meta.main) {
  const paths = readFileSync(0, "utf8")
    .split("\n")
    .filter((path) => path !== "");
  const versionOnly = versionOnlyRelease({
    headRef: process.env.HEAD_REF ?? "",
    headRepository: process.env.HEAD_REPOSITORY ?? "",
    repository: process.env.GITHUB_REPOSITORY ?? "",
    paths,
  });
  console.log(`version_only=${versionOnly}`);
}
