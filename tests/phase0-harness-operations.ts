/** Implements observed guardrail commands and temporary lifetimes; native Bun assertion callbacks are finite adapters joined before root release. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { scaffoldChild } from "../scripts/scaffold-process.js";
import { scaffoldNative } from "../scripts/scaffold-native.js";
import { ScaffoldProcessFailure } from "../scripts/scaffold-process.errors.js";
import type { CommandResult, Files } from "./phase0-harness.types.js";

/** Runs an exact native command while retaining expected negative exit codes.
 * @param command - Current Bun executable, Node or read-only Git.
 * @param args - Literal argument vector without shell interpolation.
 * @param cwd - Caller-owned command root.
 * @param timeoutMs - Finite child bound, independent of compiler/readiness requirements.
 * @returns Original exit/stdout/stderr after group release and output settlement. */
export const commandEffect = Effect.fn("GuardrailHarness.command")(
  function* (command: string, args: readonly string[], cwd: string, timeoutMs: number) {
    if (command !== process.execPath && command !== "git" && command !== "node")
      return yield* new ScaffoldProcessFailure({
        operation: "guardrail.command",
        message: "Unsupported guardrail executable",
      });
    let executable: "bun" | "git" | "node" = "bun";
    if (command === "git" || command === "node") executable = command;
    const child = yield* scaffoldChild({ executable, args, cwd });
    const [exit, out, error] = yield* Effect.promise(() => child.settled);
    if (exit.status !== "fulfilled" || out.status !== "fulfilled" || error.status !== "fulfilled")
      return yield* new ScaffoldProcessFailure({
        operation: "guardrail.command.settlement",
        message: "Guardrail child exit and output did not settle",
      });
    return { exitCode: exit.value, stdout: out.value, stderr: error.value } satisfies CommandResult;
  },
  (effect, _command, _args, _cwd, timeoutMs) =>
    observeExecution(
      "testing",
      "guardrail.command",
      effect.pipe(Effect.scoped, Effect.timeout(timeoutMs)),
    ),
);

/** Registers physical cleanup before any source write or native assertion callback.
 * @param prefix - Guardrail-owned temporary directory prefix.
 * @returns The root borrowed for the caller's Scope lifetime. */
const fixtureRoot = Effect.fn("GuardrailHarness.acquire")((prefix: string) =>
  Effect.acquireRelease(
    scaffoldNative("guardrail.temporary", () => mkdtemp(join(tmpdir(), prefix))),
    (path) =>
      scaffoldNative("guardrail.release", () => rm(path, { recursive: true, force: true })).pipe(
        Effect.orDie,
      ),
  ),
);

/** Joins finite native Bun assertions before the temporary root can close.
 * @param prefix - Guardrail-owned directory prefix.
 * @param use - Finite assertion callback borrowing the acquired root.
 * @returns Completion after assertions and physical cleanup. */
export const temporaryEffect = Effect.fn("GuardrailHarness.temporary")(
  function* (prefix: string, use: (fixture: string) => Promise<void>) {
    const fixture = yield* fixtureRoot(prefix);
    yield* scaffoldNative("guardrail.assertions", () => use(fixture));
  },
  (effect) => observeExecution("testing", "guardrail.fixture", effect.pipe(Effect.scoped)),
);

/** Materializes exact synthetic inputs inside the same owned assertion lifetime.
 * @param files - Original source bytes in insertion order.
 * @param use - Finite native callback borrowing the completed synthetic workspace.
 * @returns Completion after sequential writes, assertions and root cleanup. */
export const fixtureEffect = Effect.fn("GuardrailHarness.fixture")(
  function* (files: Files, use: (fixture: string) => Promise<void>) {
    const fixture = yield* fixtureRoot("relkit-phase0-");
    yield* scaffoldNative("guardrail.manifest", () =>
      writeFile(
        join(fixture, "package.json"),
        JSON.stringify({
          private: true,
          type: "module",
          workspaces: [
            "apps/*",
            "examples/*",
            "integrations/catalog",
            "integrations/packages/*",
            "packages/*",
          ],
        }),
      ),
    );
    yield* Effect.forEach(Object.entries(files), ([path, contents]) =>
      scaffoldNative("guardrail.source", async () => {
        const file = join(fixture, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, contents);
      }),
    );
    yield* scaffoldNative("guardrail.assertions", () => use(fixture));
  },
  (effect) => observeExecution("testing", "guardrail.fixture", effect.pipe(Effect.scoped)),
);
