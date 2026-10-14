/** Verifies real native migration through the CLI's joined process authority. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { nativeMigrationProbe } from "./native-probe.js";
import { processLayer } from "../../src/services/process.service.js";

it.live(
  "recovers partial publication and refuses conflicting or redirected recovery",
  () =>
    Effect.gen(function* () {
      expect(
        yield* nativeMigrationProbe(new URL("./recovery.probe.ts", import.meta.url)),
      ).toContain("RELKIT_LAYOUT_RECOVERY_OK");
    }).pipe(Effect.provide(processLayer)),
  120000,
);
