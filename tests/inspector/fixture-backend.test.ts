import { describe, expect, test } from "bun:test";
import { createInspectorFixture, FIXTURE_GRAPH_HASH, FIXTURE_IDS } from "./fixture-backend.ts";

describe("deterministic inspector fixture backend", () => {
  test("serves the versioned graph, collections, and redacted source metadata", async () => {
    const fixture = createInspectorFixture();
    const headers = { "x-zsys-api-version": "1", "x-zsys-api-protocol": "zsys.inspector" };
    const graph = await fixture.app.request("http://fixture/_zsys/v1/graph", { headers });
    const routes = await fixture.app.request("http://fixture/_zsys/v1/routes", { headers });
    const route = await fixture.app.request(`http://fixture/_zsys/v1/routes/${FIXTURE_IDS.route}`, {
      headers,
    });
    const source = await fixture.app.request(
      `http://fixture/_zsys/v1/source/${FIXTURE_IDS.route}`,
      { headers },
    );
    expect(graph.status).toBe(200);
    expect((await graph.json()).graphHash).toBe(FIXTURE_GRAPH_HASH);
    expect((await routes.json()).items).toHaveLength(2);
    expect((await route.json()).node.id).toBe(FIXTURE_IDS.route);
    expect((await source.json()).source.file).toBe("src/routes/create-order.route.ts");
  });

  test("keeps active identity while exposing a deterministic invalid candidate", async () => {
    const fixture = createInspectorFixture();
    const headers = { "x-zsys-api-version": "1", "x-zsys-api-protocol": "zsys.inspector" };
    const control = await fixture.app.request("http://fixture/__fixture__/candidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });
    const diagnostics = await fixture.app.request("http://fixture/_zsys/v1/diagnostics", {
      headers,
    });
    const value = await diagnostics.json();
    expect(control.status).toBe(200);
    expect(value.graphHash).toBe(FIXTURE_GRAPH_HASH);
    expect(value.status).toBe("candidate");
    expect(value.active.graphHash).toBe(FIXTURE_GRAPH_HASH);
    expect(value.candidate.status).toBe("invalid");
    expect(value.candidate.items[0].code).toBe("ZSYS_FIXTURE_COMPILE_ERROR");
  });

  test("applies a local dead-letter retry through the protected action contract", async () => {
    const fixture = createInspectorFixture();
    const headers = { "x-zsys-api-version": "1", "x-zsys-api-protocol": "zsys.inspector" };
    const response = await fixture.app.request(
      `http://fixture/_zsys/v1/actions/jobs/${FIXTURE_IDS.jobInstance}/retry`,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "idempotency-key": "fixture-retry-1",
        },
        body: JSON.stringify({
          generationId: "commerce-generation-1",
          graphHash: FIXTURE_GRAPH_HASH,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status.state).toBe("available");
  });
});
