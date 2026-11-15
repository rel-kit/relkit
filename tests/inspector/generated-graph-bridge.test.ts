/**
 * A real generated server keeps the application-port graph probe to identity (RK-03, D8),
 * while the Inspector reads the whole graph through its authenticated bridge (RK-43).
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { generatedAppFixture } from "../fixtures/inspector/generated-app.js";

let fixture: Awaited<ReturnType<typeof generatedAppFixture>>;

beforeAll(async () => {
  fixture = await generatedAppFixture();
  const deadline = Date.now() + 20_000;
  while (fixture.session.inspectionConnection === undefined && Date.now() < deadline)
    await Bun.sleep(50);
}, 90_000);

afterAll(async () => {
  await fixture?.close();
}, 60_000);

/** Calls the bridge the way the standalone Inspector and `relkit mcp` do. */
function bridge(path: string): Promise<Response> {
  const descriptor = fixture.session.inspectionConnection!.descriptor;
  return fetch(new URL(path, descriptor.endpoint), {
    headers: {
      authorization: `Bearer ${descriptor.token}`,
      "x-relkit-project-id": descriptor.projectId,
      "x-relkit-session-id": descriptor.sessionId,
    },
  });
}

test("the Inspector's graph call through the bridge returns nodes and edges", async () => {
  const response = await bridge("/_relkit/v1/graph");
  expect(response.status).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  expect(body).toMatchObject({ protocol: "relkit.inspector", version: 1 });
  expect(typeof body.generationId).toBe("string");
  expect(typeof body.graphHash).toBe("string");
  const graph = body.graph as { nodes?: unknown[]; edges?: unknown[] } | undefined;
  expect(Array.isArray(graph?.nodes)).toBe(true);
  expect(Array.isArray(graph?.edges)).toBe(true);
  expect(graph!.nodes!.length).toBeGreaterThan(0);
  expect(JSON.stringify(graph)).toContain("/hello");
});

test("the application-port graph probe without the inspection authority stays identity only", async () => {
  const backend = `http://127.0.0.1:${fixture.session.backendPort}`;
  for (const headers of [{}, { "x-relkit-inspector-session-token": "forged" }]) {
    const response = await fetch(`${backend}/_relkit/v1/graph`, { headers });
    expect(response.status).toBe(200);
    const probe = (await response.json()) as Record<string, unknown>;
    expect(typeof probe.graphHash).toBe("string");
    for (const field of ["graph", "nodes", "edges", "functions", "routes"])
      expect(probe).not.toHaveProperty(field);
    expect(JSON.stringify(probe)).not.toContain("src/");
  }
  for (const path of ["/_relkit/v1/graph/snapshot", "/_relkit/v1/graph/descriptors"]) {
    const response = await fetch(`${backend}${path}`);
    expect([401, 404]).toContain(response.status);
    expect(await response.text()).not.toContain("src/");
  }
});
