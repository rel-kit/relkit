/** Real native resource fixture preserving worker/application/telemetry release ordering assertions. */
import { expect } from "@effect/vitest";
import type { ServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.types.js";
import type { TelemetryShutdownState } from "./telemetry-shutdown-fixture.types.js";
/** @param host - Actual generated runtime boundary. @param state - Observable resource state. @returns After telemetry handles register. */
export async function registerTelemetryHandles(
  host: ServerRuntimeHost,
  state: TelemetryShutdownState,
): Promise<void> {
  await host.resource(
    "telemetry.exporters",
    async () => 1,
    () => {
      state.order.push("exporters");
    },
    undefined,
    "telemetry",
  );
  await host.resource(
    "telemetry",
    async () => 1,
    () => {
      state.telemetryOpen = false;
      state.order.push("telemetry");
    },
    undefined,
    "telemetry",
  );
}
/** @param host - Actual generated runtime boundary. @param state - Observable resource state. @returns After producer and native-worker handles register. */
export async function registerProducerHandles(
  host: ServerRuntimeHost,
  state: TelemetryShutdownState,
): Promise<void> {
  await host.resource(
    "provider",
    async () => 1,
    () => {
      expect(state.telemetryOpen).toBe(true);
      state.providerOpen = false;
      state.records.push("provider stopped");
      state.order.push("provider");
    },
  );
  await host.resource(
    "native-worker",
    async () => 1,
    () => {
      expect(state.providerOpen).toBe(true);
      state.order.push("worker");
    },
    undefined,
    "worker",
  );
}
