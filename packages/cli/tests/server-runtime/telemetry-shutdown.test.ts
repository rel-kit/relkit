import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.js";
import { ServerRuntimeFailure } from "../../src/server-runtime/server-runtime.schemas.js";

it.live(
  "quiesces application producers after persistence and before the final telemetry flush",
  () =>
    Effect.promise(async () => {
      const host = await createServerRuntimeHost({ report: () => {} });
      const order: string[] = [];
      let providerOpen = true;
      let telemetryOpen = true;
      const records = ["pending event"];
      await host.resource(
        "telemetry.exporters",
        async () => 1,
        () => {
          order.push("exporters");
        },
        undefined,
        "telemetry",
      );
      await host.resource(
        "telemetry",
        async () => 1,
        () => {
          telemetryOpen = false;
          order.push("telemetry");
        },
        undefined,
        "telemetry",
      );
      await host.resource(
        "provider",
        async () => 1,
        () => {
          expect(telemetryOpen).toBe(true);
          providerOpen = false;
          records.push("provider stopped");
          order.push("provider");
        },
      );
      await host.resource(
        "native-worker",
        async () => 1,
        () => {
          expect(providerOpen).toBe(true);
          order.push("worker");
        },
        undefined,
        "worker",
      );
      const beforeRelease = async () => {
        expect(providerOpen).toBe(true);
        expect(telemetryOpen).toBe(true);
        order.push("agents.release");
      };
      const beforeTelemetry = async () => {
        expect(providerOpen).toBe(false);
        expect(telemetryOpen).toBe(true);
        expect(records.splice(0)).toEqual(["pending event", "provider stopped"]);
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
