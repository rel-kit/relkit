/** Compares docs/dependencies.md with bun.lock so every pre-release and patch has an owner and an exit plan. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parseLockfile,
  policyProblems,
  policyRows,
  policySubjects,
} from "../../scripts/dependency-policy.ts";

const root = resolve(import.meta.dir, "../..");
const lockText = readFileSync(join(root, "bun.lock"), "utf8");
const policy = readFileSync(join(root, "docs/dependencies.md"), "utf8");

test("the repository passes and lists the oRPC beta, Drizzle candidate and patches", () => {
  const subjects = policySubjects(parseLockfile(lockText));
  expect(policyProblems(subjects, policyRows(policy))).toEqual([]);
  expect(subjects.map(({ id }) => id)).toEqual(
    expect.arrayContaining([
      "@orpc/server@2.0.0-beta.31",
      "drizzle-orm@1.0.0-rc.5-169397b",
      "blume@2.2.5",
    ]),
  );
});

test("an unlisted pre-release fails until the policy lists it with an owner and exit plan", () => {
  const lock = parseLockfile(lockText);
  const added = {
    ...lock,
    workspaces: {
      ...lock.workspaces,
      "packages/example": { name: "@relkit/example", dependencies: { "left-pad": "2.0.0-beta.1" } },
    },
    packages: { ...lock.packages, "left-pad": ["left-pad@2.0.0-beta.1"] as [string] },
  };
  const subjects = policySubjects(added);
  expect(policyProblems(subjects, policyRows(policy))).toEqual([
    "left-pad@2.0.0-beta.1 (pre-release, used by packages/example) is not listed in docs/dependencies.md.",
  ]);
  const incomplete = `${policy}\n| \`left-pad@2.0.0-beta.1\` | Pre-release | No |  |  |\n`;
  expect(policyProblems(subjects, policyRows(incomplete))).toEqual([
    "left-pad@2.0.0-beta.1: docs/dependencies.md needs an owner and an exit plan.",
  ]);
  const listed = `${policy}\n| \`left-pad@2.0.0-beta.1\` | Pre-release | No | @owner | Move to 2.0.0. |\n`;
  expect(policyProblems(subjects, policyRows(listed))).toEqual([]);
});

test("a row for a version the lockfile no longer resolves is stale", () => {
  const subjects = policySubjects(parseLockfile(lockText));
  const stale = `${policy}\n| \`hono@5.0.0-rc.1\` | Pre-release | Yes | @owner | Drop. |\n`;
  expect(policyProblems(subjects, policyRows(stale))).toEqual([
    "hono@5.0.0-rc.1 is listed in docs/dependencies.md but bun.lock does not resolve it.",
  ]);
});
