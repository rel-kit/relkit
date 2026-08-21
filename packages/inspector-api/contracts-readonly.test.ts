import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@zsys/contracts";
import { createObservabilityStream } from "@zsys/observability";
import { GRAPH_COLLECTIONS, RUNTIME_COLLECTIONS } from "./src/index.ts";
import {
  expectResponse,
  getForbiddenReads,
  identity,
  json,
  makeApp,
  post,
  queryFixture,
  secret,
} from "./contracts-fixtures.ts";

const graphIds: Record<string, string> = {
  descriptors: "orders.create",
  routes: "orders.create.http",
  functions: "orders.create",
  jobs: "orders.job",
  events: "orders.created",
  buckets: "orders.bucket",
  cache: "orders.cache",
  tools: "orders.tool",
  agents: "orders.agent",
  services: "orders",
};

describe("inspector read-only contract matrix", () => {
  test("serves every graph, runtime, health, source, and detail contract", async () => {
    const { app } = makeApp();
    for (const path of [
      API_BASE_PATH,
      API_BASE_PATH + "/health/live",
      API_BASE_PATH + "/health/ready",
      API_BASE_PATH + "/graph",
      API_BASE_PATH + "/env",
      API_BASE_PATH + "/diagnostics",
      API_BASE_PATH + "/runtime",
      API_BASE_PATH + "/runtime/state",
      API_BASE_PATH + "/source/orders.create",
      API_BASE_PATH + "/graph/source/orders.create",
      API_BASE_PATH + "/graph/descriptors",
      API_BASE_PATH + "/graph/descriptors/orders.create",
    ]) {
      const body = await json(app, path);
      expect(body.protocol).toBe("zsys.inspector");
      expect(body.version).toBe(1);
    }
    for (const collection of GRAPH_COLLECTIONS) {
      await json(app, API_BASE_PATH + "/" + collection);
      await json(app, API_BASE_PATH + "/" + collection + "/" + graphIds[collection]);
    }
    for (const collection of RUNTIME_COLLECTIONS) {
      await json(app, API_BASE_PATH + "/runtime/" + collection);
      await json(app, API_BASE_PATH + "/runtime/" + collection + "/" + graphIds[collection]);
    }
    expect(await json(app, API_BASE_PATH + "/services/orders")).toMatchObject({
      descriptor: {
        kind: "service",
        title: "Orders",
        tags: ["orders"],
        members: [{ name: "create", functionId: "orders.create" }],
        middleware: [{ id: "orders.context" }],
      },
    });
    const page = await json(app, API_BASE_PATH + "/descriptors?cursor=1&limit=2");
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("3");
    expect(
      (await json(app, API_BASE_PATH + "/functions?limit=1000")).items.length,
    ).toBeLessThanOrEqual(100);
  });

  test("covers observability filters, details, stream options, and redaction", async () => {
    const { app, stream, seen } = makeApp();
    const filter =
      "from=2026-08-16T00%3A00%3A00.000Z&to=2026-08-16T01%3A00%3A00.000Z" +
      "&severity=error&routeId=orders.create.http&functionId=orders.create" +
      "&outcome=success&requestId=request-1&traceId=trace-1&generationId=generation-one" +
      "&graphHash=sha256%3Aone&serviceId=orders&cursor=7&limit=1000" +
      "&protocol=zsys.observability.query&version=1";
    for (const path of [
      API_BASE_PATH + "/requests?" + filter,
      API_BASE_PATH + "/logs?" + filter,
      API_BASE_PATH + "/traces?" + filter,
    ]) {
      const body = await json(app, path);
      expect(body.protocol).toBe("zsys.observability.query");
      expect(body.version).toBe(1);
    }
    expect(seen.at(-1)).toMatchObject({
      from: "2026-08-16T00:00:00.000Z",
      to: "2026-08-16T01:00:00.000Z",
      severity: "error",
      routeId: "orders.create.http",
      functionId: "orders.create",
      outcome: "success",
      requestId: "request-1",
      traceId: "trace-1",
      generationId: "generation-one",
      graphHash: "sha256:one",
      serviceId: "orders",
      cursor: "7",
      limit: 100,
      protocol: "zsys.observability.query",
      version: 1,
    });
    expect((await json(app, API_BASE_PATH + "/requests/request-1")).request).toEqual({
      requestId: "request-1",
    });
    expect((await json(app, API_BASE_PATH + "/traces/trace-1")).records).toEqual([]);
    await json(app, API_BASE_PATH + "/requests/missing", 404);
    await json(app, API_BASE_PATH + "/traces/missing", 404);
    stream.publish({ type: "generation.changed", data: { generationId: identity.generationId } });
    const response = await app.request(
      API_BASE_PATH +
        "/stream?cursor=0&afterCursor=0&type=generation.changed&queueSize=1&overflow=drop-oldest&backpressure=drop-oldest",
      { headers: { "last-event-id": "0" } },
    );
    expectResponse(response, 200);
    const reader = response.body!.getReader();
    const connected = new TextDecoder().decode((await reader.read()).value);
    expect(connected).toBe(": connected\n\n");
    const frame = new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    expect(frame).toContain("event: generation.changed");
    expect(frame).toContain('"generationId":"generation-one"');
    expect(frame).not.toContain(secret);
    const all = await Promise.all([
      json(app, API_BASE_PATH + "/graph"),
      json(app, API_BASE_PATH + "/runtime"),
      post(app, "/actions/functions/orders.create/invoke", {
        ...identity,
        idempotencyKey: "redaction-action",
        input: { password: secret },
      }).then((result) => result.text()),
    ]);
    expect(JSON.stringify(all)).not.toContain(secret);
    expect(getForbiddenReads()).toBe(0);
  });
});
