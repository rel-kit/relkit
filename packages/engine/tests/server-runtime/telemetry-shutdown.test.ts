/** Verifies engine-owned generation lifetime, preserving the existing lifecycle contract. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.js";
import { registerTelemetryHandles, registerProducerHandles } from "./telemetry-shutdown-fixture.js";
import { ServerRuntimeFailure } from "../../src/server-runtime/server-runtime.schemas.js";

it.live(
  "quiesces application producers after persistence and before the final telemetry flush",
  () =>
    Effect.promise(async () => {
      const host = await createServerRuntimeHost({ report: () => {} });
      const order: string[] = [];
      const state = { order, records: ["pending event"], providerOpen: true, telemetryOpen: true };
      await registerTelemetryHandles(host, state);
      await registerProducerHandles(host, state);
      const beforeRelease = async () => {
        expect(state.providerOpen).toBe(true);
        expect(state.telemetryOpen).toBe(true);
        order.push("agents.release");
      };
      const beforeTelemetry = async () => {
        expect(state.providerOpen).toBe(false);
        expect(state.telemetryOpen).toBe(true);
        expect(state.records.splice(0)).toEqual(["pending event", "provider stopped"]);
        order.push("flush");
      };
      await Promise.all([
        host.shutdown(beforeRelease, beforeTelemetry),
        host.shutdown(beforeRelease, beforeTelemetry),
      ]);
      expect(order).toEqual([
        "worker",
        "agents.release",
        "provider",
        "flush",
        "telemetry",
        "exporters",
      ]);
    }),
);

it.live("retains cleanup failures and still closes telemetry after a failed final flush", () =>
  Effect.promise(async () => {
    const host = await createServerRuntimeHost({ report: () => {} });
    const providerFailure = new Error("provider close");
    const flushFailure = new Error("flush");
    let released = 0;
    await host.resource(
      "telemetry",
      async () => 1,
      () => {
        released++;
      },
      undefined,
      "telemetry",
    );
    await host.resource(
      "provider",
      async () => 1,
      () => {
        throw providerFailure;
      },
    );
    const snapshot = await host.shutdown(
      async () => {},
      async () => {
        throw flushFailure;
      },
    );
    expect(released).toBe(1);
    expect(
      snapshot.cleanupFailures.map((failure) =>
        failure.cause instanceof ServerRuntimeFailure ? failure.cause.cause : failure.cause,
      ),
    ).toEqual([providerFailure, flushFailure]);
  }),
);
