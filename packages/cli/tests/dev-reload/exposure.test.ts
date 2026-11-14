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

/**
 * Lists a process's TCP listening addresses.
 * @param pid - Process to inspect.
 * @returns Addresses such as `127.0.0.1:51234` or `*:51234`.
 */
async function listeners(pid: number): Promise<string[]> {
  const lsof = Bun.spawn(["lsof", "-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = await new Response(lsof.stdout).text();
  await lsof.exited;
  return [...text.matchAll(/TCP (\S+) \(LISTEN\)/g)].map((match) => match[1]!);
}

test(
  "the development worker listens on loopback only",
  async () => {
    const served = await dev.waitFor("/a1", "a1 v0");
    // The worker's parent is the dev process, which owns the public front and the bridge.
    const ps = Bun.spawn(["ps", "-o", "ppid=", "-p", String(served.pid)], { stdout: "pipe" });
    const parent = Number((await new Response(ps.stdout).text()).trim());
    for (const pid of [served.pid, parent]) {
      const addresses = await listeners(pid);
      expect(addresses.length).toBeGreaterThan(0);
      for (const address of addresses) expect(address).toMatch(/^(?:127\.0\.0\.1|\[::1\]):\d+$/);
    }
  },
  { timeout: 300_000 },
);

test(
  "blocked inspection paths on the development front answer Problem Details",
  async () => {
    await dev.waitFor("/a1", "a1 v0");
    const port = /http:\/\/127\.0\.0\.1:(\d+)/.exec(dev.output())?.[1];
    expect(port).toBeDefined();
    for (const path of ["/_relkit/v1/requests", "/_relkit/v1/env", "/_relkit/v1"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(response.headers.get("x-request-id")).toMatch(/\S/);
      expect(await response.json()).toMatchObject({ status: 404, code: "not-found" });
    }
  },
  { timeout: 300_000 },
);

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
