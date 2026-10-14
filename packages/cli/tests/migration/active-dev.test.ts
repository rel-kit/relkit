/** Exercises known active-dev rejection using a scope-owned native process. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { nativeMigrationProbe } from "./native-probe.js";
import { processLayer } from "../../src/services/process.service.js";

it.live(
  "refuses known development ownership and allows migration after its child is reaped",
  () =>
    Effect.gen(function* () {
      expect(
        yield* nativeMigrationProbe(new URL("./active-dev.probe.ts", import.meta.url)),
      ).toContain("RELKIT_LAYOUT_ACTIVE_DEV_OK");
    }).pipe(Effect.provide(processLayer)),
  120000,
);
