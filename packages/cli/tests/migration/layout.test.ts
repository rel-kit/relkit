/** Verifies real native migration through the CLI's joined process authority. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { nativeMigrationProbe } from "./native-probe.js";
import { processLayer } from "../../src/services/process.service.js";

it.live(
  "previews, validates, applies, reruns and rolls back without changing persistent state",
  () =>
    Effect.gen(function* () {
      expect(yield* nativeMigrationProbe(new URL("./layout.probe.ts", import.meta.url))).toContain(
        "RELKIT_LAYOUT_MIGRATION_OK",
      );
    }).pipe(Effect.provide(processLayer)),
  120000,
);
