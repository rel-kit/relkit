/** Proves transient upstream failures are bounded and cannot poison an entire packed-fixture registry. */
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRegistry } from "../pack-and-smoke-create-relkit-pack.js";

for (const failure of ["network", "HTTP 503"] as const)
  test(`evicts an upstream ${failure} failure and retains its native deadline`, async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-registry-cache-"));
    const nativeFetch = globalThis.fetch;
    const server = await startRegistry(root, new Map(), new Map());
    const signals: (AbortSignal | undefined | null)[] = [];
    let attempts = 0;
    const upstream = spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      signals.push(init?.signal);
      if (++attempts === 1) {
        if (failure === "network") throw new Error("Injected upstream failure");
        return new Response("Temporary upstream failure", { status: 503 });
      }
      return Response.json({ name: "fixture", versions: {} });
    });
    try {
      const path = `http://127.0.0.1:${server.port}/fixture`;
      expect((await nativeFetch(path)).status).toBe(failure === "network" ? 502 : 503);
      const recovered = await nativeFetch(path);
      expect(recovered.status).toBe(200);
      expect(await recovered.json()).toEqual({ name: "fixture", versions: {} });
      expect(attempts).toBe(2);
      expect(signals.every((signal) => signal instanceof AbortSignal && !signal.aborted)).toBe(
        true,
      );
      expect((await nativeFetch(path)).status).toBe(200);
      expect(attempts).toBe(3);
    } finally {
      upstream.mockRestore();
      await server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  });
