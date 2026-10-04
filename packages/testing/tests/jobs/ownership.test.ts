import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { runBunFixture } from "../fixtures/bun-process.js";

it.effect("joins real native job/event work before restart and close", () =>
  Effect.gen(function* () {
    const result = yield* runBunFixture(
      new URL("../fixtures/work-cancellation.ts", import.meta.url).pathname,
    );
    expect(result.stdout).toContain("RELKIT_NATIVE_WORK_CANCELLATION_OK");
  }),
);
