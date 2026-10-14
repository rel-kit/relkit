/** Exercises shared migration metadata, pure parser syntax and conflicting operation exits. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { parseEffectCli } from "../../src/cli-effect-runtime.js";
import { runCli } from "../../src/main.js";

it.live("parses preview/write/rollback and exposes shared help/completions", () =>
  Effect.gen(function* () {
    const parsed = yield* Effect.promise(() =>
      parseEffectCli(["migrate", "layout", "--write"], "test"),
    );
    expect(parsed.invocation).toEqual({ command: "migrate", args: ["layout", "--write"] });
    const help = yield* Effect.promise(() =>
      parseEffectCli(["migrate", "layout", "--help"], "test"),
    );
    expect(help.stdout).toContain("--rollback");
    const completions = yield* Effect.promise(() =>
      parseEffectCli(["--completions", "bash"], "test"),
    );
    expect(completions.stdout).toContain("migrate");
  }),
);

it.live("rejects --write with --rollback as one structured usage failure", () =>
  Effect.gen(function* () {
    const stdout: string[] = [];
    const status = yield* Effect.promise(() =>
      runCli(["--json", "migrate", "layout", "--write", "--rollback", "receipt"], {
        installSignalHandlers: false,
        io: { stdout: (line) => stdout.push(line), stderr: () => undefined },
      }),
    );
    expect(status).toBe(2);
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("RELKIT_LAYOUT_USAGE");
  }),
);
