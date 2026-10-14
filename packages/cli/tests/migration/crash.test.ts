/** Verifies crash recovery against an actually killed native publisher. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { nativeMigrationProbe } from "./native-probe.js";
import { processLayer } from "../../src/services/process.service.js";

it.live(
  "restores a killed publisher from the retained guarded receipt",
  () =>
    Effect.gen(function* () {
      expect(yield* nativeMigrationProbe(new URL("./crash.probe.ts", import.meta.url))).toContain(
        "RELKIT_LAYOUT_CRASH_OK",
      );
    }).pipe(Effect.provide(processLayer)),
  120000,
);
