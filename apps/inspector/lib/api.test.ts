import { describe, expect, test } from "bun:test";
import {
  INSPECTOR_API_PROTOCOL,
  INSPECTOR_API_VERSION,
  InspectorApiError,
  createInspectorApiClient,
} from "./api";

const envelope = (value: Record<string, unknown>, status = 200) =>
  new Response(
    JSON.stringify({ protocol: INSPECTOR_API_PROTOCOL, version: INSPECTOR_API_VERSION, ...value }),
    {
      status,
      headers: { "content-type": "application/json", "x-zsys-api-version": "1" },
    },
  );

describe("inspector API client", () => {
  test("preserves a same-origin proxy prefix", async () => {
    let requestedUrl = "";
    const client = createInspectorApiClient({
      baseUrl: "http://127.0.0.1:9999/_zsys/backend",
      fetch: async (url) => {
        requestedUrl = String(url);
        return envelope({ items: [] });
      },
    });

    await client.list("routes");

    expect(requestedUrl).toBe("http://127.0.0.1:9999/_zsys/backend/_zsys/v1/routes");
  });

  test("negotiates the version and invalidates cached graph data", async () => {
    const requests: RequestInit[] = [];
    const client = createInspectorApiClient({
      cacheTtlMs: 10_000,
      fetch: async (_url, init) => {
        requests.push(init ?? {});
        return envelope({ graph: { nodes: [], edges: [] } });
      },
    });

    await client.graph();
    await client.graph();
    expect(requests).toHaveLength(1);
    expect(new Headers(requests[0]?.headers).get("x-zsys-api-version")).toBe("1");
    client.invalidate(["graph"]);
    await client.graph();
    expect(requests).toHaveLength(2);
  });

  test("retries transient GET failures during backend startup", async () => {
    let attempts = 0;
    const client = createInspectorApiClient({
      cacheTtlMs: 0,
      fetch: async () => {
        attempts += 1;
        return attempts === 1
          ? envelope({ error: "ZSYS_INSPECTOR_GRAPH_UNAVAILABLE" }, 503)
          : envelope({ items: [] });
      },
    });

    await expect(client.list("routes")).resolves.toMatchObject({ items: [] });
    expect(attempts).toBe(2);
  });

  test("rejects protocol mismatch and reports network disconnection", async () => {
    const mismatch = createInspectorApiClient({
      cacheTtlMs: 0,
      fetch: async () =>
        new Response(JSON.stringify({ protocol: "wrong", version: 1 }), {
          headers: { "content-type": "application/json" },
        }),
    });
    await expect(mismatch.graph()).rejects.toMatchObject({
      code: "ZSYS_INSPECTOR_PROTOCOL_MISMATCH",
      kind: "protocol",
    });

    const disconnected = createInspectorApiClient({
      fetch: async () => {
        throw new Error("offline");
      },
    });
    await expect(disconnected.graph()).rejects.toBeInstanceOf(InspectorApiError);
    await expect(disconnected.graph()).rejects.toMatchObject({
      code: "ZSYS_INSPECTOR_DISCONNECTED",
      kind: "network",
    });
  });

  test("accepts full and bounded runtime signal pages", async () => {
    const urls: string[] = [];
    const client = createInspectorApiClient({
      cacheTtlMs: 0,
      fetch: async (url) => {
        const requested = new URL(String(url), "http://inspector.test");
        urls.push(requested.toString());
        return requested.searchParams.get("cursor") === "1"
          ? envelope({ items: [{ functionId: "sum", signal: "log", id: "second" }] })
          : envelope({
              items: [{ functionId: "sum", signal: "log", id: "first" }],
              nextCursor: "1",
            });
      },
    });
    const first = await client.query("logs", { functionId: "sum", limit: 1 });
    expect(first.nextCursor).toBe("1");
    const second = await client.query("logs", {
      functionId: "sum",
      limit: 1,
      cursor: first.nextCursor,
    });

    expect(first.items).toEqual([{ functionId: "sum", signal: "log", id: "first" }]);
    expect(second.items).toEqual([{ functionId: "sum", signal: "log", id: "second" }]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).not.toBe(urls[1]);
    expect(new URL(urls[1]!).searchParams.get("cursor")).toBe("1");
  });
});
