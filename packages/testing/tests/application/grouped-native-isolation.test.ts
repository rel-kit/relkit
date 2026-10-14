/** Verifies grouped native loading in Bun with isolated real SQLite/auth owners. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { runBunFixture } from "../fixtures/bun-process.js";

it.effect("isolates grouped database/auth owners and preserves borrowed lifetime", () =>
  Effect.gen(function* () {
    const result = yield* runBunFixture(
      new URL("../fixtures/grouped-service-isolation.ts", import.meta.url).pathname,
    );
    expect(result.stdout).toContain("RELKIT_GROUPED_NATIVE_SERVICE_ISOLATION_OK");
  }),
);
