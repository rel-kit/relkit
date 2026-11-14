/**
 * A real `relkit dev` answers the application-port graph probe with its activation witness only,
 * and keeps serving reloads after the probe lost the structural graph.
 */
import { afterAll, expect, test } from "bun:test";
import { createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";

const fixture = createDevFixture();
const dev = await startDev(fixture.root);

afterAll(async () => {
  await dev.stop();
  fixture.remove();
}, 60_000);

test(
  "the development graph probe carries identity only and reloads still activate",
  async () => {
    await dev.waitFor("/a1", "a1 v0");
    const probe = (await dev.get("/_relkit/v1/graph")) as unknown as Record<string, unknown>;
    expect(probe).toMatchObject({ protocol: "relkit.inspector", version: 1 });
    expect(typeof probe.graphHash).toBe("string");
    expect(probe.activationFingerprint).toBeDefined();
    for (const field of ["graph", "functions", "nodes", "routes"])
      expect(probe).not.toHaveProperty(field);
    const text = JSON.stringify(probe);
    for (const secret of ["src/services", "a1.function", "functions/"])
      expect(text).not.toContain(secret);
    fixture.write("src/services/alpha/functions/a1.function.ts", functionSource("a1", "v1"));
    await dev.waitFor("/a1", "a1 v1");
  },
  { timeout: 300_000 },
);
