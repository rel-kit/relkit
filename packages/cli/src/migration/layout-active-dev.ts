/** Detects known live RELKIT development commands by their native cwd before publication. */
import { Effect } from "effect";
import { realpath } from "node:fs/promises";
import { cliPromise } from "../cli-errors.js";
import { CliProcess } from "../services/process.service.js";
import { fail } from "../main-support.js";

/**
 * Refuses a known live dev process while leaving unrelated editors and processes alone.
 * @param root - Canonical authored root.
 * @returns Completion when no identified RELKIT dev command owns this root.
 * @remarks Unknown external watchers still require the plan's explicit stop-development advice.
 */
export const assertNoActiveLayoutDev = Effect.fn("Migration.guard.dev")(function* (root: string) {
  const processes = yield* CliProcess;
  const canonicalRoot = yield* cliPromise("migration.dev.root", () => realpath(root));
  const listing = yield* processes.run({ command: "ps", args: ["-Ao", "pid=,args="], cwd: root });
  if (listing.exitCode !== 0)
    return yield* Effect.fail(
      fail(
        "RELKIT_LAYOUT_PROCESS_INSPECTION_UNAVAILABLE",
        "Cannot inspect active development processes.",
      ),
    );
  for (const line of listing.stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (
      !match ||
      Number(match[1]) === process.pid ||
      !/(?:relkit(?:\/[^ ]+)?|bun|npm|pnpm)\s+(?:run\s+)?dev(?:\s|$)/.test(match[2] ?? "")
    )
      continue;
    const cwd = yield* processes.run({
      command: "lsof",
      args: ["-a", "-p", String(match[1]), "-d", "cwd", "-Fn"],
      cwd: root,
    });
    if (
      cwd.exitCode === 0 &&
      cwd.stdout.split("\n").some((path) => path === `n${root}` || path === `n${canonicalRoot}`)
    )
      return yield* Effect.fail(
        fail(
          "RELKIT_LAYOUT_ACTIVE_DEV",
          `Stop development process ${match[1]} before migrating this root.`,
        ),
      );
  }
});
