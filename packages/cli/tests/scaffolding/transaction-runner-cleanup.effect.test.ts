/** Ensures early test failure releases and joins its ignored-signal installer before temporary-root cleanup. */

import { expect, it } from "@effect/vitest";
import { access } from "node:fs/promises";
import { Cause, Effect, Exit } from "effect";
import {
  ignoredRunnerCleanupEffect,
  ignoredRunnerCommand,
  ignoredRunnerSetupEffect,
} from "./transaction-runner.fixture.js";

it.live("joins ignored-signal fixture work when the test body fails before release", () =>
  Effect.gen(function* () {
    let settled = false;
    let root = "";
    const primary = new Error("Test body failed before installer release.");
    const exit = yield* Effect.exit(
      Effect.scoped(
        Effect.gen(function* () {
          const setup = yield* ignoredRunnerSetupEffect();
          root = setup.root;
          const command = ignoredRunnerCommand(setup);
          const task = command([], root, setup.controller.signal).then(() => {
            settled = true;
          });
          yield* ignoredRunnerCleanupEffect(setup, task);
          yield* Effect.promise(() => setup.started.promise);
          return yield* Effect.fail(primary);
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)).toEqual([
        primary,
      ]);
    expect(settled).toBe(true);
    expect(
      yield* Effect.promise(() =>
        access(root).then(
          () => true,
          () => false,
        ),
      ),
    ).toBe(false);
  }),
);
