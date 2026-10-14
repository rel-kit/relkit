/** Verifies real native migration through the CLI's joined process authority. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { nativeMigrationProbe } from "./native-probe.js";
import { processLayer } from "../../src/services/process.service.js";

it.live(
  "preserves unrelated Git work and refuses touched tracked changes",
  () =>
    Effect.gen(function* () {
      expect(yield* nativeMigrationProbe(new URL("./git.probe.ts", import.meta.url))).toContain(
        "RELKIT_LAYOUT_GIT_OK",
      );
    }).pipe(Effect.provide(processLayer)),
  120000,
);
