/** Exercises client request headers: application payloads stay intact and explicit stale controls stay stale. */
import { expect, test } from "bun:test";
import { InspectorApiTransport } from "./api-transport";
import { InspectorApiClient } from "./api";

for (const mode of ["ordinary", "stream"])
  for (const generationId of ["image-123", ""])
    test(`${mode} application generationId ${JSON.stringify(generationId)} cannot replace its fence`, async () => {
      const requests: RequestInit[] = [];
      const client = new InspectorApiClient({
        cacheTtlMs: 0,
        fetch: async (_url, init) => {
          requests.push(init ?? {});
          return Response.json(
            { protocol: "relkit.inspector", version: 1 },
            { headers: { "x-relkit-generation-id": "current" } },
          );
        },
      });
      await client.graph();
      const body = JSON.stringify({ generationId });
      for (const headers of [{}, { "x-relkit-generation-id": "explicit-stale" }]) {
        const input = { path: "/images", init: { method: "POST", body, headers } };
        if (mode === "ordinary") await client.invokeRoute(input);
        else await client.invokeRouteStream(input, "text", () => {}, new AbortController().signal);
      }
      expect(
        requests.map((request) => new Headers(request.headers).get("x-relkit-generation-id")),
      ).toEqual([null, "current", "explicit-stale"]);
      expect(requests.slice(1).map((request) => request.body)).toEqual([body, body]);
    });

test("route console and streamed mutations retain the observed generation", async () => {
  const fences: (string | null)[] = [];
  const client = new InspectorApiClient({
    cacheTtlMs: 0,
    fetch: async (_url, init) => {
      fences.push(new Headers(init?.headers).get("x-relkit-generation-id"));
      return Response.json(
        { protocol: "relkit.inspector", version: 1 },
        {
          headers: { "x-relkit-generation-id": "current" },
        },
      );
    },
  });
  await client.graph();
  await client.invokeRoute({ path: "/orders", init: { method: "POST", body: "{}" } });
  await client.invokeRouteStream(
    { path: "/orders", init: { method: "POST", body: "{}" } },
    "text",
    () => {},
    new AbortController().signal,
  );
  await client.invokeRoute({
    path: "/orders",
    init: { method: "POST", body: "{}", headers: { "x-relkit-generation-id": "stale" } },
  });
  expect(fences).toEqual([null, "current", "current", "stale"]);
});

test("observed generation fences native controls and explicit stale actions stay stale", async () => {
  const fences: (string | null)[] = [];
  const client = new InspectorApiTransport({
    cacheTtlMs: 0,
    fetch: async (_url, init) => {
      fences.push(new Headers(init?.headers).get("x-relkit-generation-id"));
      return Response.json({
        protocol: "relkit.inspector",
        version: 1,
        generationId: "generation-2",
      });
    },
  });
  await client.request("/_relkit/v1/graph");
  await client.request("/_relkit/v1/jobs/runs/id/cancel", { method: "POST", body: "{}" });
  await client.request("/_relkit/v1/actions", {
    method: "POST",
    body: '{"generationId":"generation-1"}',
  });
  expect(fences).toEqual([null, "generation-2", "generation-1"]);
});

test("a lost mutation response is sent once", async () => {
  let sent = 0;
  const client = new InspectorApiTransport({
    fetch: async () => {
      sent++;
      throw new Error("lost");
    },
  });
  await expect(
    client.request("/_relkit/v1/actions", { method: "POST", body: "{}" }),
  ).rejects.toThrow();
  expect(sent).toBe(1);
});

test("native response generation fences controls without changing application payloads", async () => {
  const fences: (string | null)[] = [];
  const client = new InspectorApiTransport({
    cacheTtlMs: 0,
    fetch: async (_url, init) => {
      fences.push(new Headers(init?.headers).get("x-relkit-generation-id"));
      return Response.json(
        { protocol: "relkit.inspector", version: 1, items: [] },
        {
          headers: { "x-relkit-generation-id": "observed-one" },
        },
      );
    },
  });
  await client.request("/_relkit/v1/runtime/jobs");
  await client.request("/_relkit/v1/jobs/runs/id/cancel", { method: "POST", body: "{}" });
  expect(fences).toEqual([null, "observed-one"]);
});
