import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { runBunFixture } from "../fixtures/bun-process.js";

it.effect(
  "isolates simultaneous and fresh database/auth owners through real Bun application loading",
  () =>
    Effect.gen(function* () {
      const result = yield* runBunFixture(
        new URL("../fixtures/service-isolation.ts", import.meta.url).pathname,
      );
      expect(result.stdout).toContain("RELKIT_NATIVE_SERVICE_ISOLATION_OK");
    }),
);
