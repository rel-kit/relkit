/** The commands `relkit migrate` prints afterwards are spelled for the project's package manager. */
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codeMigrationResult, codeRollbackResult } from "../../src/migration/code-result.js";
import {
  layoutMigrationResult,
  rollbackMigrationResult,
} from "../../src/migration/layout-result.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * Creates a project root that declares a package manager.
 * @param packageManager - `packageManager` field value.
 * @returns Project root.
 */
async function projectRoot(packageManager: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-migrate-steps-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "app", packageManager }));
  return root;
}

const cases = [
  ["bun@1.3.10", "bun install", "bun run"],
  ["npm@11.19.1", "npm install", "npm run"],
  ["pnpm@11.1.0", "pnpm install", "pnpm run"],
] as const;

test.each(cases)("code migration next steps for %s", async (field, install, run) => {
  const root = await projectRoot(field);
  const plan = { root, changes: [], findings: [] } as never;
  const expected = [install, `${run} check`, `${run} typecheck`, `${run} test`];
  expect(codeMigrationResult(plan, "committed", "record").nextSteps).toEqual(expected);
  expect(codeMigrationResult(plan, "preview").nextSteps).toEqual([]);
  expect(codeRollbackResult(root, { edits: [] } as never, "record").nextSteps).toEqual(expected);
});

test.each(cases)("layout migration next steps for %s", async (field, _install, run) => {
  const root = await projectRoot(field);
  const plan = {
    root,
    layout: { kind: "flat" },
    moves: [],
    edits: [],
    warnings: [],
    conflicts: [],
  } as never;
  const expected = [`${run} check`, `${run} typecheck`, `${run} dev -- --prepare`, `${run} dev`];
  expect(layoutMigrationResult(plan, "committed", "record").nextSteps).toEqual(expected);
  expect(rollbackMigrationResult(root, { edits: [] } as never, "record").nextSteps).toEqual(
    expected,
  );
});
