/** Exercises real CLI decisions against competing main snapshots, original archives and retryable follow-up dispatch. */
import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withReleaseFixture } from "../fixtures/release-selection.js";

test(
  "empty changesets do nothing; pending changes require exact successful current main CI",
  () =>
    withReleaseFixture(async (f) => {
      expect((await f.run()).output).toContain("mode=none");
      await f.change();
      expect((await f.run()).output).toContain("mode=version");
      expect((await f.run({ noCi: true })).output).toContain("mode=none");
      const wrong = await f.run({ ciSha: "a".repeat(40) });
      expect(wrong.code).not.toBe(0);
    }),
  30_000,
);

test(
  "main advancing before the first pack publishes the original verified version commit",
  () =>
    withReleaseFixture(async (f) => {
      const source = await f.plan();
      expect((await f.run()).output).toBe(`mode=publish\nsha=${source}\n`);
      await f.change();
      const advanced = f.commit();
      const selected = await f.run({ sha: source, mainSha: advanced });
      expect(selected.code, selected.diagnostics).toBe(0);
      expect(selected.output).toBe(`mode=publish\nsha=${source}\n`);
      expect((await f.run({ sha: source, noCi: true })).output).toContain("mode=none");
      const next = await f.run({ complete: true, mainSha: advanced, ciSha: advanced });
      expect(next.output).toBe(`mode=version\nsha=${advanced}\n`);
    }),
  30_000,
);

test(
  "an old queued snapshot recovers an archive produced by a newer execution",
  () =>
    withReleaseFixture(async (f) => {
      const source = await f.plan();
      const newer = f.commit();
      f.git("checkout", "--detach", source);
      const recovered = await f.run({ sha: source, executionSha: newer, previous: true });
      expect(recovered.code, recovered.diagnostics).toBe(0);
      expect(recovered.output).toContain(`mode=recover\nsha=${source}\nartifact_id=123`);
      for (const failure of [{ expired: true }, { missing: true }]) {
        const refused = await f.run({
          sha: source,
          executionSha: newer,
          previous: true,
          ...failure,
        });
        expect(refused.code).not.toBe(0);
        expect(refused.diagnostics).toContain("Original release archives");
      }
      expect(
        (await f.run({ sha: source, executionSha: newer }, { RECOVERY_RUN_ID: "42" })).output,
      ).toContain("mode=recover");
    }),
  30_000,
);

test(
  "formatting cannot move batch identity and semantic same-version edits are rejected",
  () =>
    withReleaseFixture(async (f) => {
      const source = await f.plan();
      const path = join(f.root, ".changeset/release.json");
      const plan = JSON.parse(await readFile(path, "utf8"));
      await writeFile(path, JSON.stringify(plan, null, 2));
      f.commit();
      expect((await f.run({ sha: source })).output).toBe(`mode=publish\nsha=${source}\n`);
      plan.packages[0].version = "0.7.11";
      await writeFile(path, JSON.stringify(plan));
      f.commit();
      const refused = await f.run({ sha: source });
      expect(refused.code).not.toBe(0);
      expect(refused.diagnostics).toContain("without a new batch version");
    }),
  30_000,
);

test(
  "publication requeues newer verified work; retrying a failed dispatch progresses and same-SHA runs stop",
  () =>
    withReleaseFixture(async (f) => {
      const source = await f.plan();
      await f.change();
      const main = f.commit();
      const env = { PUBLISHED_SOURCE_SHA: source };
      const state = { sha: source, mainSha: main, ciSha: main, complete: true };
      const failed = await f.run({ ...state, dispatchFails: true }, env, ["--reconcile"]);
      expect(failed.code).not.toBe(0);
      const retry = await f.run(state, env, ["--reconcile"]);
      expect(retry.code, retry.diagnostics).toBe(0);
      expect(retry.calls).toContain(`inputs[verified_sha]=${main}`);
      expect((await f.run(state)).output).toContain("mode=version");
      expect((await f.run(state, {}, ["--reconcile"])).calls).toBe("");
      expect((await f.run({ ...state, noCi: true }, env, ["--reconcile"])).calls).toBe("");
      f.git("checkout", "--detach", source);
      expect((await f.run(state, {}, ["--reconcile"])).calls).toContain(
        `inputs[verified_sha]=${main}`,
      );
    }),
  30_000,
);
