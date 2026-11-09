/**
 * Behind a TLS-terminating platform proxy the server sees `http://` URLs. With
 * `RELKIT_TRUST_PROXY=1` (which the Railway Dockerfile sets) a browser mutation from the public
 * `https://` origin passes the same-origin check; without it the server keeps denying it.
 */
import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { buildProject } from "../../packages/cli/src/commands/build.ts";
import { startProject } from "../../packages/cli/src/commands/start.ts";
import { copyProject, roots } from "./lifecycle.fixture.ts";

const successful = new Set<string>();
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (successful.delete(root)) await rm(root, { recursive: true, force: true });
    else console.error(`Failed forwarded-proto fixture retained: ${root}`);
  }
});

/**
 * Sends a browser-style mutation as the proxy forwards it.
 * @param port - Local server port.
 * @returns The response status.
 */
async function forwardedPost(port: number): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/hello`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: `https://127.0.0.1:${port}`,
      "x-forwarded-proto": "https",
    },
    body: "{}",
  });
  await response.body?.cancel();
  return response.status;
}

test("RELKIT_TRUST_PROXY takes the request scheme from X-Forwarded-Proto", async () => {
  const root = await copyProject();
  expect((await buildProject({ projectRoot: root })).ok).toBe(true);
  for (const trust of [false, true]) {
    const started = await startProject({
      projectRoot: root,
      port: 0,
      healthTimeoutMs: 10_000,
      environment: { NODE_ENV: "production", ...(trust ? { RELKIT_TRUST_PROXY: "1" } : {}) },
    });
    try {
      const status = await forwardedPost(started.port);
      if (trust) expect(status).not.toBe(403);
      else expect(status).toBe(403);
    } finally {
      await started.stop();
    }
  }
  successful.add(root);
});
