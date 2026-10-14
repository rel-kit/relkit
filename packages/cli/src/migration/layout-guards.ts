/** Rechecks authored epochs and touched Git dirtiness without changing repository or runtime state. */
import { Effect } from "effect";
import { CliProcess } from "../services/process.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { cliValidation } from "../cli-errors.js";
import { fail } from "../main-support.js";
import { LayoutFiles } from "./layout-files.service.js";
import type { MigrationFile, MigrationPlan } from "./layout.types.js";
import { assertNoActiveLayoutDev } from "./layout-active-dev.js";

/**
 * Refuses any changed inventoried input, including new or removed authored files.
 * @param plan - Fresh plan whose bytes were validated.
 * @returns Completion only when its entire authored epoch still matches.
 */
export const assertLayoutEpoch = Effect.fn("Migration.guard.epoch")(function* (
  plan: MigrationPlan,
) {
  const current = yield* (yield* LayoutFiles).inventory(plan.root);
  yield* cliValidation(() => {
    const expected = JSON.stringify(
      plan.files.map(({ path, hash, mode }) => ({ path, hash, mode })),
    );
    const actual = JSON.stringify(current.map(({ path, hash, mode }) => ({ path, hash, mode })));
    if (expected !== actual)
      throw fail(
        "RELKIT_LAYOUT_CONCURRENT_EDIT",
        "Authored files changed during migration validation; run preview again.",
      );
  });
});

/**
 * Refuses touched tracked dirtiness and existing directory destinations before staging.
 * @param plan - Immutable preview edit set.
 * @returns Completion when publication is eligible; unrelated dirtiness is preserved.
 */
export const assertLayoutWritePolicy = Effect.fn("Migration.guard.write")(function* (
  plan: MigrationPlan,
) {
  const process = yield* CliProcess;
  const fs = yield* CliFileSystem;
  yield* assertNoActiveLayoutDev(plan.root);
  yield* cliValidation(() => {
    if (plan.conflicts.length)
      throw fail(
        "RELKIT_LAYOUT_CONFLICT",
        plan.conflicts.map((finding) => `${finding.file}: ${finding.message}`).join("\n"),
      );
  });
  for (const move of plan.moves) {
    if (yield* fs.exists(`${plan.root}/${move.to}`))
      return yield* Effect.fail(
        fail("RELKIT_LAYOUT_DESTINATION_EXISTS", `Destination already exists: ${move.to}`),
      );
  }
  const repo = yield* process.run({
    command: "git",
    args: ["rev-parse", "--show-prefix"],
    cwd: plan.root,
  });
  if (repo.exitCode === 0) {
    const prefix = repo.stdout.trim();
    for (const flags of [[], ["--cached"]]) {
      const dirty = yield* process.run({
        command: "git",
        args: ["diff", ...flags, "--name-only", "-z"],
        cwd: plan.root,
      });
      if (dirty.exitCode !== 0)
        return yield* Effect.fail(
          fail("RELKIT_LAYOUT_GIT_UNAVAILABLE", "Unable to inspect tracked changes."),
        );
      const touched = new Set(plan.edits.map((edit) => prefix + edit.before.path));
      const conflict = dirty.stdout.split("\0").find((path) => touched.has(path));
      if (conflict !== undefined)
        return yield* Effect.fail(
          fail("RELKIT_LAYOUT_DIRTY", `Touched tracked file is dirty: ${conflict}`),
        );
    }
  } else if (repo.exitCode !== 128)
    return yield* Effect.fail(
      fail("RELKIT_LAYOUT_GIT_UNAVAILABLE", "Unable to determine Git ownership."),
    );
});

/**
 * Compares complete bytes and modes, treating absence as a distinct snapshot state.
 * @param actual - Current native file or absence.
 * @param expected - Required receipt snapshot or absence.
 * @returns Whether the owned file still matches.
 */
export function sameLayoutFile(
  actual: MigrationFile | undefined,
  expected: MigrationFile | undefined,
): boolean {
  return actual === undefined
    ? expected === undefined
    : expected !== undefined && actual.hash === expected.hash && actual.mode === expected.mode;
}
