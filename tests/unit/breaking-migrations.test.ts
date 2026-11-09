/**
 * Checks the release rule that every breaking changeset names a `relkit migrate` rule through
 * the migration guide section it links: a fixture with an uncovered, a page-only and an unlinked
 * breaking change fails, and the repository's own changesets pass.
 */
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { breakingMigrationProblems, ruleAnchors } from "../../scripts/breaking-migrations.ts";

const fixture = join(import.meta.dir, "fixtures/breaking-migrations");
const root = resolve(import.meta.dir, "../..");

test("fails on breaking changesets without a relkit migrate rule or guide section", async () => {
  const problems = await breakingMigrationProblems({
    changesets: join(fixture, "changesets"),
    guides: join(fixture, "guides"),
    ruleAnchors: new Set(["error-ids"]),
  });
  expect(problems).toEqual([
    "no-link.md: breaking change has no migration guide link.",
    "no-rule.md: #problem-details is not the guide section of any relkit migrate rule.",
    "page-only.md: link the migration guide section of this change (/guides/migrate/<page>#<section>).",
  ]);
});

test("the repository's breaking changesets each have a rule and a guide section", async () => {
  const problems = await breakingMigrationProblems({
    changesets: join(root, ".changeset"),
    guides: join(root, "apps/docs/content"),
    ruleAnchors: await ruleAnchors(),
  });
  expect(problems).toEqual([]);
});
