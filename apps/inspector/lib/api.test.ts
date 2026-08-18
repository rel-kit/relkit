import { describe, expect, test } from "bun:test";
import {
  INSPECTOR_API_PROTOCOL,
  INSPECTOR_API_VERSION,
  InspectorApiError,
  createInspectorApiClient,
} from "./api";

const envelope = (value: Record<string, unknown>) =>
  new Response(
    JSON.stringify({ protocol: INSPECTOR_API_PROTOCOL, version: INSPECTOR_API_VERSION, ...value }),
    { headers: { "content-type": "application/json", "x-zsys-api-version": "1" } },
  );

describe("inspector API client", () => {
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

  test("accepts the observability query protocol for signal pages", async () => {
    const client = createInspectorApiClient({
      fetch: async () =>
        new Response(
          JSON.stringify({ protocol: "zsys.observability.query", version: 1, items: [] }),
          { headers: { "content-type": "application/json", "x-zsys-api-version": "1" } },
        ),
    });
    const page = await client.query("requests");
    expect(page.protocol).toBe("zsys.observability.query");
    expect(page.items).toEqual([]);
  });
});
