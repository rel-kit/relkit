import { describe, expect, test } from "bun:test";
import { Hono } from "../../packages/inspector-api/node_modules/hono";
import type { RunSnapshot } from "../../packages/contracts/src/jobs-run.ts";
import { installInspectorEndpoints, type InspectorJobsBinding } from "../../packages/inspector-api/src/index.ts";

function makeApp(list: InspectorJobsBinding["list"]): Hono {
  const app = new Hono();
  installInspectorEndpoints(app, {
    activeGeneration: {
      generationId: "inspector-test-generation",
      graphHash: "inspector-test-graph",
      graph: {
        nodes: [{ kind: "job", id: "job.emails", jobId: "job.emails", name: "emails", executionModel: "task", taskId: "task.emails", taskVersion: "1" }],
        edges: [],
      },
      jobs: {
        bindings: [{ service: "primary", serviceGeneration: "service-1", list, get: async () => snapshot("run-1", "running") }],
      },
    },
  });
  return app;
}

function snapshot(runId: string, status: RunSnapshot["status"]): RunSnapshot {
  return { accepted: true, runId, jobId: "job.emails", taskId: "task.emails", taskVersion: "1", buildId: "build-1", service: "primary", acceptedAt: "2026-09-17T00:00:00.000Z", status, observedAt: "2026-09-17T00:00:00.000Z", resultAvailability: "not-selected" } as RunSnapshot;
}

describe("Inspector job name filters", () => {
  test("resolves names before bounded native queries", async () => {
    let query: Readonly<Record<string, unknown>> | undefined;
    const app = makeApp(async (value) => { query = value; return { items: [snapshot("run-1", "running")], hasMore: false, availability: [] }; });
    const response = await app.request("http://fixture/_relkit/v1/jobs/runs?job=emails&status=running&acceptedFrom=2026-09-16T00:00:00.000Z&limit=25");
    expect(response.status).toBe(200);
    expect(query).toMatchObject({ jobId: "job.emails", status: ["running"], acceptedFrom: "2026-09-16T00:00:00.000Z", limit: 25 });
  });

  test("rejects a cursor after a filter change", async () => {
    const app = makeApp(async () => ({ items: [snapshot("run-1", "running")], hasMore: true, nextCursor: "native-1", availability: [] }));
    const first = await app.request("http://fixture/_relkit/v1/jobs/runs?nativeQuery=provider-one&limit=1");
    const cursor = (await first.json()).nextCursor;
    const changed = await app.request(`http://fixture/_relkit/v1/jobs/runs?nativeQuery=provider-two&cursor=${cursor}`);
    expect(changed.status).toBe(400);
  });

  test("rejects browser-controlled scope filters before native listing", async () => {
    let calls = 0;
    const app = makeApp(async () => {
      calls += 1;
      return { items: [], hasMore: false, availability: [] };
    });
    const response = await app.request("http://fixture/_relkit/v1/jobs/runs?scope=tenant-a");
    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });
});
