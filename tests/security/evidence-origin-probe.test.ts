import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL(
  "../../openspec/changes/effect-specialized-packages/completion-2026-10-05-1791190554/foreign-origin.mjs",
  import.meta.url,
).pathname;

async function runProbe(base: string | undefined, evidence: string) {
  const env = { ...process.env, RELKIT_AI_EVIDENCE_DIR: evidence };
  delete env.RELKIT_ORIGIN_PROBE_URL;
  if (base !== undefined) env.RELKIT_ORIGIN_PROBE_URL = base;
  const child = Bun.spawn([process.execPath, script], { env, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

test("origin evidence probe rejects unapproved destinations before making requests", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      requests++;
      return Response.json({ graph: { nodes: [{ id: "hello.greet" }] } });
    },
  });
  const evidence = await mkdtemp(join(tmpdir(), "relkit-origin-probe-"));
  try {
    for (const base of [
      server.url.origin,
      undefined,
      "http://example.com",
      "http://127.0.0.1:3000@evil.example",
      "http://127.0.0.1:3000.evil.example",
      "http://127.0.0.1:3000/redirect",
      "http://127.0.0.1:3000?target=evil.example",
      "http://127.0.0.1:3000#evil.example",
      "https://127.0.0.1:3000",
    ]) {
      const result = await runProbe(base, evidence);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(
        "RELKIT_ORIGIN_PROBE_URL must select a recorded local origin",
      );
    }
    expect(requests).toBe(0);
  } finally {
    server.stop(true);
    await rm(evidence, { recursive: true, force: true });
  }
});

test("origin evidence probe preserves HTTP and WebSocket checks for both recorded origins", async () => {
  for (const port of [3000, 3330]) {
    const requests: { path: string; method: string; origin: string | null }[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch(request) {
        const path = new URL(request.url).pathname;
        requests.push({ path, method: request.method, origin: request.headers.get("origin") });
        if (path === "/_relkit/v1/graph") {
          return Response.json({
            graph: { nodes: [{ id: port === 3000 ? "hello.greet" : "hello.hello" }] },
            generationId: "test-generation",
            graphHash: "test-hash",
          });
        }
        return Response.json({ error: { id: "ORIGIN_DENIED" } }, { status: 403 });
      },
    });
    const evidence = await mkdtemp(join(tmpdir(), "relkit-origin-probe-"));
    try {
      const result = await runProbe(server.url.origin, evidence);
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(requests).toEqual([
        { path: "/_relkit/v1/graph", method: "GET", origin: null },
        {
          path: `/_relkit/v1/actions/functions/${port === 3000 ? "hello.greet" : "hello.hello"}/invoke`,
          method: "POST",
          origin: "https://foreign.example",
        },
        { path: "/rpc", method: "GET", origin: "https://foreign.example" },
      ]);
      const saved = JSON.parse(
        await readFile(join(evidence, "foreign-origin-results.json"), "utf8"),
      );
      expect(saved.base).toBe(server.url.origin);
      expect(saved.http).toEqual({ status: 403, id: "ORIGIN_DENIED" });
      expect(saved.websocket.opened).toBe(false);
    } finally {
      server.stop(true);
      await rm(evidence, { recursive: true, force: true });
    }
  }
});

test("origin evidence probe never follows HTTP or WebSocket redirects", async () => {
  let redirectedRequests = 0;
  const target = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      redirectedRequests++;
      return Response.json({ graph: { nodes: [] }, error: { id: "ORIGIN_DENIED" } });
    },
  });
  const evidence = await mkdtemp(join(tmpdir(), "relkit-origin-probe-"));
  try {
    for (const redirectFrom of ["graph", "invocation", "websocket"]) {
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 3330,
        fetch(request) {
          const path = new URL(request.url).pathname;
          if (redirectFrom !== "graph" && path === "/_relkit/v1/graph") {
            return Response.json({ graph: { nodes: [] } });
          }
          if (redirectFrom === "websocket" && path !== "/rpc") {
            return Response.json({ error: { id: "ORIGIN_DENIED" } }, { status: 403 });
          }
          return Response.redirect(target.url, 307);
        },
      });
      try {
        const result = await runProbe(server.url.origin, evidence);
        if (redirectFrom === "websocket") expect(result.exitCode).toBe(0);
        else expect(result.exitCode).not.toBe(0);
        expect(redirectedRequests).toBe(0);
      } finally {
        server.stop(true);
      }
    }
  } finally {
    target.stop(true);
    await rm(evidence, { recursive: true, force: true });
  }
});
