/** Checks the launch drafts and that the GitHub apply script writes nothing unless it is told to. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { POSITIONING } from "../../scripts/positioning.ts";
import {
  applyLaunch,
  EXISTING_GOOD_FIRST_ISSUES,
  LABELS,
  parseDrafts,
  type GitHub,
} from "../../scripts/launch/apply-github.ts";

const launch = resolve(import.meta.dir, "../../scripts/launch");
const drafts = parseDrafts(readFileSync(resolve(launch, "good-first-issues.md"), "utf8"));

test("about ten good first issue drafts, each with a title, known labels and a done condition", () => {
  expect(drafts).toHaveLength(10);
  expect(new Set(drafts.map((draft) => draft.title)).size).toBe(10);
  for (const draft of drafts) {
    expect(draft.labels).toContain("good first issue");
    for (const label of draft.labels) expect(LABELS.map(({ name }) => name)).toContain(label);
    expect(draft.body).toContain("**Done when**");
    expect(draft.body.length).toBeGreaterThan(80);
  }
});

test("the proposed description is the positioning sentence", () => {
  expect(readFileSync(resolve(launch, "repository-description.txt"), "utf8").trim()).toBe(
    POSITIONING,
  );
});

/** A repository with nothing set up, recording the commands it is given. */
function emptyRepository(writes: string[][]): GitHub {
  return {
    read: async (args) =>
      args[0] === "repo" ? JSON.stringify({ description: "", hasDiscussionsEnabled: false }) : "[]",
    write: async (args) => {
      writes.push([...args]);
    },
  };
}

test("every change goes through write, so a dry run reports them without making any", async () => {
  const writes: string[][] = [];
  const { changes } = await applyLaunch(emptyRepository(writes), "owner/name", drafts, "text");
  // Discussions, the description, four labels, ten issues and the existing issues.
  expect(changes).toBe(2 + LABELS.length + 10 + EXISTING_GOOD_FIRST_ISSUES.length);
  expect(writes).toHaveLength(changes);
  expect(writes[0]).toEqual(["repo", "edit", "owner/name", "--enable-discussions"]);
});

test("labels and issues that already exist are skipped", async () => {
  const writes: string[][] = [];
  const github: GitHub = {
    read: async (args) => {
      if (args[0] === "repo")
        return JSON.stringify({ description: "text", hasDiscussionsEnabled: true });
      if (args[0] === "label") return JSON.stringify(LABELS.map(({ name }) => ({ name })));
      return JSON.stringify(drafts.map(({ title }) => ({ title })));
    },
    write: async (args) => {
      writes.push([...args]);
    },
  };
  const { changes } = await applyLaunch(github, "owner/name", drafts, "text");
  expect(changes).toBe(EXISTING_GOOD_FIRST_ISSUES.length);
});
