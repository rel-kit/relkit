/**
 * Verifies doctor probes application and explicitly fixed bridge listeners only.
 * A tool's UI flags/environment never select a backend-owned listener, and an
 * ephemeral bridge cannot collide with a fixed application port before binding.
 */
import { expect, test } from "vitest";
import { loadConfig } from "@relkit/compiler";
import { checkPorts } from "../../src/commands/doctor-checks.js";

test("disabled inspection never probes the standalone UI port", async () => {
  const probes: number[] = [];
  const result = await checkPorts(
    loadConfig({ server: { port: 3000 } }),
    {
      source: { RELKIT_INSPECTOR_PORT: "3000" },
      inspectorPort: 3000,
    },
    async (port) => {
      probes.push(port);
      return true;
    },
  );
  expect(result.ok).toBe(true);
  expect(probes).toEqual([3000]);
});

test("enabled ephemeral bridge is allocated at runtime rather than probed as a fixed port", async () => {
  const probes: number[] = [];
  const result = await checkPorts(
    loadConfig({ inspector: { enabled: true } }),
    {
      source: { PORT: "0" },
    },
    async (port) => {
      probes.push(port);
      return true;
    },
  );
  expect(result.ok).toBe(true);
  expect(probes).toEqual([0]);
});

test("fixed bridge port participates in collision and availability checks", async () => {
  const config = loadConfig({ inspector: { enabled: true, connection: { port: 4010 } } });
  const result = await checkPorts(config, { source: {} }, async (port) => port !== 4010);
  expect(result.ok).toBe(false);
  const collision = await checkPorts(config, { source: { PORT: "4010" } }, async () => true);
  expect(collision.ok).toBe(false);
  expect(collision.message).toMatch(/collide/);
});
