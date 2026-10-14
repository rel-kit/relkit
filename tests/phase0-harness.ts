/** Bridges native Bun guardrail assertions to scoped Effect commands and fixture lifetimes with precise original exit/output results. */
import { join, resolve } from "node:path";
import { Context, Effect, Layer } from "effect";
import { commandEffect, fixtureEffect, temporaryEffect } from "./phase0-harness-operations.js";
import type { CommandResult, Files } from "./phase0-harness.types.js";

export const root = resolve(import.meta.dir, "..");
export const boundaryScript = join(root, "scripts/check-boundaries.ts");

/** Captures native harness operations once; methods own isolated scopes and share no mutable fixture state. */
class GuardrailHarness extends Context.Service<GuardrailHarness>()(
  "relkit.tests.GuardrailHarness",
  {
    make: Effect.succeed({
      command: commandEffect,
      fixture: fixtureEffect,
      temporary: temporaryEffect,
    }),
  },
) {}
const live = Layer.effect(GuardrailHarness, GuardrailHarness.make);

/** Runs one actual native command at the Bun test boundary.
 * @param command - Exact supported executable.
 * @param args - Literal native arguments.
 * @param cwd - Caller-owned root, defaulting to this checkout.
 * @param timeoutMs - Native child bound; expected negative exit codes remain result data.
 * @returns Original result after child-group termination and both output drains. */
export function execute(
  command: string,
  args: readonly string[],
  cwd = root,
  timeoutMs = 4_000,
): Promise<CommandResult> {
  return Effect.runPromise(
    Effect.flatMap(GuardrailHarness, (harness) =>
      harness.command(command, args, cwd, timeoutMs),
    ).pipe(Effect.provide(live)),
  );
}

/** Owns a synthetic workspace across a finite native assertion callback.
 * @param files - Exact original synthetic inputs.
 * @param use - Finite callback borrowing the completed fixture.
 * @returns Completion after assertions and joined root cleanup. */
export function withFixture(files: Files, use: (fixture: string) => Promise<void>): Promise<void> {
  return Effect.runPromise(
    Effect.flatMap(GuardrailHarness, (harness) => harness.fixture(files, use)).pipe(
      Effect.provide(live),
    ),
  );
}

/** Owns a non-workspace guardrail fixture across a finite native callback.
 * @param prefix - Guardrail-owned directory prefix.
 * @param use - Finite callback borrowing the owned root.
 * @returns Completion after assertion settlement and joined cleanup. */
export function withTemporary(
  prefix: string,
  use: (fixture: string) => Promise<void>,
): Promise<void> {
  return Effect.runPromise(
    Effect.flatMap(GuardrailHarness, (harness) => harness.temporary(prefix, use)).pipe(
      Effect.provide(live),
    ),
  );
}
