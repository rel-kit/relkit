import { describe, expect, test } from "bun:test";
import { createClient } from "../../packages/client/src/index.ts";
import { createOperationId } from "../../packages/realtime/src/index.ts";
import { createInspectorFixture, FIXTURE_GRAPH_HASH, FIXTURE_IDS } from "./fixture-backend.ts";

describe("deterministic inspector fixture backend", () => {
  test("serves the versioned graph, collections, and redacted source metadata", async () => {
    const fixture = createInspectorFixture();
    const headers = { "x-relkit-api-version": "1", "x-relkit-api-protocol": "relkit.inspector" };
    const graph = await fixture.app.request("http://fixture/_relkit/v1/graph", { headers });
    const routes = await fixture.app.request("http://fixture/_relkit/v1/routes", { headers });
    const route = await fixture.app.request(
      `http://fixture/_relkit/v1/routes/${FIXTURE_IDS.route}`,
      {
        headers,
      },
    );
    const source = await fixture.app.request(
      `http://fixture/_relkit/v1/source/${FIXTURE_IDS.route}`,
      { headers },
    );
    expect(graph.status).toBe(200);
    const graphValue = await graph.json();
    expect(graphValue.graphHash).toBe(FIXTURE_GRAPH_HASH);
    expect(graphValue.graph.nodes.find((node: any) => node.id === FIXTURE_IDS.agent)).toMatchObject(
      {
        client: "public",
        chat: { input: "message", output: "answer" },
      },
    );
    expect((await routes.json()).items).toHaveLength(2);
    expect((await route.json()).node.id).toBe(FIXTURE_IDS.route);
    expect((await source.json()).source.file).toBe("src/routes/create-order.route.ts");
  });

  test("keeps active identity while exposing a deterministic invalid candidate", async () => {
    const fixture = createInspectorFixture();
    const headers = { "x-relkit-api-version": "1", "x-relkit-api-protocol": "relkit.inspector" };
    const control = await fixture.app.request("http://fixture/__fixture__/candidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });
    const diagnostics = await fixture.app.request("http://fixture/_relkit/v1/diagnostics", {
      headers,
    });
    const value = await diagnostics.json();
    expect(control.status).toBe(200);
    expect(value.graphHash).toBe(FIXTURE_GRAPH_HASH);
    expect(value.status).toBe("candidate");
    expect(value.active.graphHash).toBe(FIXTURE_GRAPH_HASH);
    expect(value.candidate.status).toBe("invalid");
    expect(value.candidate.items[0].code).toBe("RELKIT_FIXTURE_COMPILE_ERROR");
  });

  test("applies a local dead-letter retry through the protected action contract", async () => {
    const fixture = createInspectorFixture();
    const headers = { "x-relkit-api-version": "1", "x-relkit-api-protocol": "relkit.inspector" };
    const response = await fixture.app.request(
      `http://fixture/_relkit/v1/actions/jobs/${FIXTURE_IDS.jobInstance}/retry`,
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

  test("streams todo and tool state through a durable human-input resume", async () => {
    const fixture = createInspectorFixture();
    const client = createClient<any>({
      baseUrl: "http://fixture",
      headers: {
        "x-relkit-identity-scope": "browser",
        "x-relkit-session-epoch": "fixture-0",
      },
      fetch: (request, init) => fixture.app.fetch(new Request(request, init)),
    });
    const threadId = `inspector:${crypto.randomUUID()}`;
    await client["relkit.agent.run"]({
      agentId: FIXTURE_IDS.agent,
      threadId,
      operationId: createOperationId(),
      kind: "run",
      payload: "Review the order",
    });
    const waiting = await waitForThread(client, threadId, "waiting");
    expect(waiting.values.todos).toMatchObject([
      { content: "Look up the order", status: "completed" },
      { content: "Ask for approval", status: "in_progress" },
    ]);
    expect(waiting.currentMessages.some((message: any) => message.role === "tool")).toBe(true);
    expect(waiting.waiting.response).toMatchObject({ type: "boolean" });
    await client["relkit.agent.run"]({
      agentId: FIXTURE_IDS.agent,
      threadId,
      operationId: createOperationId(),
      kind: "run",
      resume: true,
      waitingRevision: waiting.waiting.revision,
      payload: false,
    });
    const complete = await waitForThread(client, threadId, "idle");
    expect(complete.currentMessages.at(-1)?.parts[0].text).toBe("The order was rejected.");
  });
});

async function waitForThread(client: any, threadId: string, status: string): Promise<any> {
  let latest: any;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({
      agentId: FIXTURE_IDS.agent,
      threadId,
    }).catch(() => undefined);
    latest = snapshot;
    if (snapshot?.thread.status === status) return snapshot;
    await Bun.sleep(20);
  }
  throw new Error(`Agent thread did not reach ${status}: ${JSON.stringify(latest)}`);
}
