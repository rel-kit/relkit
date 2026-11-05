/**
 * A handler edit is swapped into the running server: the next request uses the new handler
 * and the process ID is unchanged. A configuration change, where provider bindings live,
 * restarts through blue/green: a new server process starts and replaces the old one.
 */
import { afterAll, expect, test } from "bun:test";
import { configSource, createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";

const fixture = createDevFixture();
const dev = await startDev(fixture.root);

afterAll(async () => {
  await dev.stop();
  fixture.remove();
}, 60_000);

test(
  "swaps an edited handler without restarting the server",
  async () => {
    const before = await dev.waitFor("/a1", "a1 v0");
    fixture.write("src/services/alpha/functions/a1.function.ts", functionSource("a1", "v1"));
    const after = await dev.waitFor("/a1", "a1 v1");
    expect(after.pid).toBe(before.pid);
    expect((await dev.get("/b1"))?.pid).toBe(before.pid);
    expect(dev.output()).toContain("(same process)");
  },
  { timeout: 300_000 },
);

test(
  "restarts on a configuration change",
  async () => {
    const before = await dev.waitFor("/a1", "a1 v1");
    fixture.write("relkit.config.ts", configSource(2_097_152));
    const deadline = Date.now() + 240_000;
    let pid = before.pid;
    while (pid === before.pid && Date.now() < deadline) {
      await Bun.sleep(100);
      pid = (await dev.get("/a1"))?.pid ?? pid;
    }
    expect(pid).not.toBe(before.pid);
    expect((await dev.get("/a1"))?.message).toBe("a1 v1");
  },
  { timeout: 300_000 },
);
