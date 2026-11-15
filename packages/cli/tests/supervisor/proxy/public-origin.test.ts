/**
 * RK-39 at the proxy hop on Node: the worker derives its request URL from `Host`, so the proxy
 * must deliver the public authority there. Node's `fetch` drops `Host`; the proxy's Node client
 * keeps it, and client-sent forwarding headers pass through untouched and unused.
 */
import { nodeRuntime } from "relkit/runtime/node";
import type { RuntimeServer } from "relkit/runtime";
import { afterAll, beforeAll, expect, test } from "vitest";
import { hostPreservingFetch } from "../../../src/supervisor/proxy-forward.js";
import { createSupervisorProxy, type SupervisorProxy } from "../../../src/supervisor/proxy.js";

let upstream: RuntimeServer;
let proxy: SupervisorProxy;
let origin = "";

beforeAll(async () => {
  upstream = await nodeRuntime.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/empty") return new Response(null, { status: 204 });
      if (path === "/cookies") {
        const headers = new Headers();
        headers.append("set-cookie", "a=1; Path=/");
        headers.append("set-cookie", "b=2; Path=/");
        return new Response("ok", { headers });
      }
      return Response.json({
        url: request.url,
        host: request.headers.get("host"),
        forwardedHost: request.headers.get("x-forwarded-host"),
        body: request.method === "POST" ? await request.text() : null,
      });
    },
  });
  proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port });
  origin = `http://127.0.0.1:${proxy.port}`;
});

afterAll(async () => {
  await proxy.stop();
  await upstream.stop(true);
});

test("Node's fetch replaces a given Host with the address it connects to", async () => {
  const response = await fetch(`http://127.0.0.1:${upstream.port}/`, {
    headers: { host: "public.test:4100" },
  });
  expect(await response.json()).toMatchObject({ host: `127.0.0.1:${upstream.port}` });
});

test("the worker sees the public origin of a POST sent through the proxy", async () => {
  const response = await fetch(`${origin}/write?x=1`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: '{"a":1}',
  });
  const seen = (await response.json()) as { url: string; host: string; body: string };
  expect(new URL(seen.url).origin).toBe(origin);
  expect(seen).toMatchObject({ host: `127.0.0.1:${proxy.port}`, body: '{"a":1}' });
  expect(new URL(seen.url).search).toBe("?x=1");
});

test("client forwarding headers do not change the worker's request URL", async () => {
  const response = await fetch(`${origin}/read`, {
    headers: { "x-forwarded-host": "attacker.example", forwarded: "host=attacker.example" },
  });
  const seen = (await response.json()) as { url: string; forwardedHost: string };
  expect(new URL(seen.url).origin).toBe(origin);
  expect(seen.forwardedHost).toBe("attacker.example");
});

test("the Node client keeps Host, repeated headers and bodiless statuses", async () => {
  const target = `http://127.0.0.1:${upstream.port}`;
  const seen = await hostPreservingFetch(`${target}/`, { headers: { host: "public.test:4100" } });
  expect(await seen.json()).toMatchObject({ url: "http://public.test:4100/" });
  const cookies = await hostPreservingFetch(`${target}/cookies`);
  expect(cookies.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  expect(await cookies.text()).toBe("ok");
  const empty = await hostPreservingFetch(`${target}/empty`, { method: "DELETE" });
  expect(empty.status).toBe(204);
  expect(empty.body).toBeNull();
  const head = await hostPreservingFetch(`${target}/`, { method: "HEAD" });
  expect(head.body).toBeNull();
});

test("the Node client rejects when its signal aborts before the answer", async () => {
  const controller = new AbortController();
  controller.abort(new Error("stopped"));
  await expect(
    hostPreservingFetch(`http://127.0.0.1:${upstream.port}/`, { signal: controller.signal }),
  ).rejects.toThrow();
});
