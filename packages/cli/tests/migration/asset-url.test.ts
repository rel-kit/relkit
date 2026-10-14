/** Runs asset migration and recovery through the real native process, compiler and engine. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { nativeMigrationProbe } from "./native-probe.js";
import { processLayer } from "../../src/services/process.service.js";

it.live(
  "retains native asset reads across layout publication and rollback",
  () =>
    Effect.gen(function* () {
      expect(
        yield* nativeMigrationProbe(new URL("./asset-url.probe.ts", import.meta.url)),
      ).toContain("RELKIT_LAYOUT_ASSET_URL_OK");
    }).pipe(Effect.provide(processLayer)),
  120000,
);
