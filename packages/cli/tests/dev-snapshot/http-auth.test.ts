/**
 * Exercises native protected graph authentication without altering process env.
 * The scoped loopback fixture checks credential isolation, current-token lookup,
 * and redirect rejection through the same fetch seam used by SDK verification.
 */
import { expect, it } from "@effect/vitest";
import { API_BASE_PATH } from "@relkit/contracts";
import { Effect, Exit } from "effect";
import { ownedNativePromise } from "../../src/services/owned-promise.js";
import { authProbeListener } from "./http-auth-fixture.js";
import {
  makeSnapshotVerificationFetch,
  snapshotProbeHeaders,
} from "../../src/dev-snapshot/snapshot-http-auth.js";

it.effect("injects internal tokens only into reserved protocol paths", () =>
  Effect.sync(() => {
    expect(snapshotProbeHeaders("/hello", "synthetic").has("authorization")).toBe(false);
    expect(snapshotProbeHeaders(`${API_BASE_PATH}/graph`, undefined).has("authorization")).toBe(
      false,
    );
    expect(
      snapshotProbeHeaders(`${API_BASE_PATH}-public/graph`, "synthetic").has("authorization"),
    ).toBe(false);
    expect(snapshotProbeHeaders(`${API_BASE_PATH}/graph`, "synthetic").get("authorization")).toBe(
      "Bearer synthetic",
    );
  }),
);

it.live("authenticates real graph probes and never follows credential redirects", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const received: string[] = [];
      let token = "first";
      const base = yield* authProbeListener(received);
      const fetcher = makeSnapshotVerificationFetch(() => token);
      for (const path of [`${API_BASE_PATH}/graph`, "/hello", `${API_BASE_PATH}/graph`]) {
        const response = yield* ownedNativePromise("test.probe.fetch", (signal) =>
          fetcher(base + path, { signal }),
        );
        expect(yield* ownedNativePromise("test.probe.body", () => response.text())).toBe(
          "complete",
        );
        token = "second";
      }
      const exit = yield* Effect.exit(
        ownedNativePromise("test.probe.redirect", (signal) =>
          fetcher(`${base}${API_BASE_PATH}/redirect`, { signal }),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(received).toEqual(["Bearer first", "absent", "Bearer second", "Bearer second"]);
    }),
  ),
);
