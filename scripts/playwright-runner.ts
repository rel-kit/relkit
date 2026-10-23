/** Runs the installed native Playwright CLI within the existing scoped child
 * owner, keeping native teardown ahead of cache retirement on interruption.
 */
import { Effect } from "effect";
import { scaffoldChild } from "./scaffold-process.js";
import type { ScaffoldCommand } from "./scaffold-process.types.js";
import { closePlaywright } from "./playwright-cleanup.js";

/** Owns a finite native Playwright invocation, preserving its native exit code.
 * @param command - Installed CLI and exact selected suite environment.
 * @param artifacts - Unique invocation root for recorded webServer groups.
 * @returns Native exit after scoped browser/server cleanup.
 */
export const runPlaywright = Effect.fn("Playwright.run")(
  (command: ScaffoldCommand, artifacts: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* scaffoldChild(command);
        yield* Effect.addFinalizer(() => Effect.promise(() => closePlaywright(owner, artifacts)));
        return yield* Effect.promise(() => owner.process.exited);
      }),
    ),
);
