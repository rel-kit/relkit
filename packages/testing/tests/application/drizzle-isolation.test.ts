/** Database-only test applications retain their native owner until application shutdown. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { runBunFixture } from "../fixtures/bun-process.js";

it.effect("requires explicit native selection and isolates real SQLite test owners", () =>
  Effect.gen(function* () {
    const result = yield* runBunFixture(
      new URL("../fixtures/drizzle-service-isolation.ts", import.meta.url).pathname,
    );
    expect(result.stdout).toContain("RELKIT_DRIZZLE_HELPER_ISOLATION_OK");
  }),
);
