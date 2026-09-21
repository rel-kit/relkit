import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import { API_BASE_PATH } from "@relkit/contracts";
import {
  installInspectorEndpoints,
  type InspectorJobsBinding,
  type InspectorJobsServices,
} from "./src/index.ts";

const graph = {
  appId: "jobs-test",
  nodes: [
    {
      kind: "task",
      id: "task.orders",
      taskId: "task.orders",
      version: "1",
      execution: "durable",
      input: { type: "object" },
      output: { type: "object" },
      policy: {},
      resources: {},
      capabilities: {},
    },
    {
      kind: "job",
      id: "job.orders",
      jobId: "job.orders",
      name: "orders",
      taskId: "task.orders",
      taskVersion: "1",
      buildId: "build-1",
      profile: "primary",
      serviceGeneration: "generation-1",
      executionModel: "task",
      implicit: false,
      default: true,
    },
  ],
  edges: [],
};

function run(
  runId: string,
  acceptedAt: string,
  service: string,
  status: RunSnapshot["status"] = "completed",
): RunSnapshot {
  return {
    accepted: true,
    runId,
    jobId: "job.orders",
    taskId: "task.orders",
    taskVersion: "1",
    buildId: "build-1",
    service,
    acceptedAt,
    status,
    observedAt: acceptedAt,
    resultAvailability: status === "completed" ? "void" : "not-selected",
  } as RunSnapshot;
}

function page(items: readonly RunSnapshot[], nextCursor?: string): RunPage<RunSnapshot> {
  return {
    items,
    hasMore: nextCursor !== undefined,
    availability: [],
    ...(nextCursor === undefined ? {} : { nextCursor }),
    count: { value: 4, accuracy: "exact" },
  };
}

function app(jobs: InspectorJobsServices): Hono {
  const value = new Hono();
  installInspectorEndpoints(value, {
    activeGeneration: { generationId: "generation-1", graphHash: "graph-1", graph, jobs },
  });
  return value;
}

function binding(service: string, list: InspectorJobsBinding["list"]): InspectorJobsBinding {
  return {
    service,
    serviceGeneration: "generation-1",
    capabilities: { features: { cancel: true, retry: true } },
    list,
    get: async (runId) => run(runId, "2026-09-17T00:00:00.000Z", service),
    cancel: async (runId, operationId) => ({ runId, operationId, outcome: "requested" }),
    retry: async (runId) => run(`${runId}-retry`, "2026-09-17T00:00:00.000Z", service) as never,
  };
}

function scheduleBinding(
  service: string,
  list: NonNullable<InspectorJobsBinding["schedules"]>["list"],
): InspectorJobsBinding {
  return {
    ...binding(service, async () => page([])),
    schedules: {
      list,
      get: async () => ({}),
      upsert: async () => ({}),
      pause: async () => ({}),
      resume: async () => ({}),
      delete: async () => ({}),
    },
  };
}

describe("Inspector jobs API", () => {
  test("keeps definitions separate and resolves API-name filters", async () => {
    const jobs = {
      bindings: [binding("primary", async () => page([]))],
    } satisfies InspectorJobsServices;
    const response = await app(jobs).request(`${API_BASE_PATH}/jobs/definitions?limit=1`);
    expect(response.status).toBe(200);
    expect((await response.json()).items[0]).toMatchObject({
      name: "orders",
      taskId: "task.orders",
      health: "unknown",
    });
    const runs = await app(jobs).request(`${API_BASE_PATH}/jobs/runs?job=orders&limit=1`);
    expect(runs.status).toBe(200);
  });

  test("preserves unconsumed rows across aggregate pages and rejects cursor reuse", async () => {
    const values = {
      primary: [
        run("a-1", "2026-09-17T00:00:03.000Z", "primary"),
        run("a-2", "2026-09-17T00:00:01.000Z", "primary"),
      ],
      secondary: [
        run("b-1", "2026-09-17T00:00:02.000Z", "secondary"),
        run("b-2", "2026-09-17T00:00:00.000Z", "secondary"),
      ],
    };
    const makeList =
      (service: keyof typeof values): InspectorJobsBinding["list"] =>
      async (query) =>
        query.cursor === undefined ? page(values[service]) : page(values[service]);
    const jobs = {
      bindings: [
        binding("primary", makeList("primary")),
        binding("secondary", makeList("secondary")),
      ],
    } satisfies InspectorJobsServices;
    const server = app(jobs);
    const first = await server.request(`${API_BASE_PATH}/jobs/runs?limit=1`);
    const firstBody = await first.json();
    expect(firstBody.items[0].runId).toBe("a-1");
    const second = await server.request(
      `${API_BASE_PATH}/jobs/runs?limit=1&cursor=${firstBody.nextCursor}`,
    );
    expect((await second.json()).items[0].runId).toBe("b-1");
    const changed = await server.request(
      `${API_BASE_PATH}/jobs/runs?limit=1&status=running&cursor=${firstBody.nextCursor}`,
    );
    expect(changed.status).toBe(400);
  });

  test("reports an unavailable service and enforces Inspector privilege", async () => {
    const jobs = {
      bindings: [
        binding("healthy", async () =>
          page([run("healthy-1", "2026-09-17T00:00:00.000Z", "healthy")]),
        ),
        binding("down", async () => {
          throw new Error("down");
        }),
      ],
      authorize: async () => false,
    } satisfies InspectorJobsServices;
    const denied = await app(jobs).request(`${API_BASE_PATH}/jobs/runs`);
    expect(denied.status).toBe(403);
    const thrown = await app({
      ...jobs,
      authorize: async () => {
        throw new Error("authorization failed");
      },
    }).request(`${API_BASE_PATH}/jobs/runs`);
    expect(thrown.status).toBe(403);
    const allowed = app({ ...jobs, authorize: undefined });
    const response = await allowed.request(`${API_BASE_PATH}/jobs/runs?limit=1`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.availability).toContainEqual({
      service: "down",
      state: "unavailable",
      reason: "native service unavailable",
    });
    expect(body.items).toHaveLength(1);
  });

  test("propagates native unavailability and suppresses exact counts", async () => {
    const jobs = {
      bindings: [
        binding("inngest", async () => ({
          items: [],
          hasMore: false,
          availability: [
            { service: "inngest", state: "unavailable", reason: "historical list unsupported" },
          ],
          count: { value: 0, accuracy: "exact" },
        })),
      ],
    } satisfies InspectorJobsServices;
    const response = await app(jobs).request(`${API_BASE_PATH}/jobs/runs`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.partial).toBe(true);
    expect(body.count).toBeUndefined();
    expect(body.availability).toContainEqual({
      service: "inngest",
      state: "unavailable",
      reason: "historical list unsupported",
    });
  });

  test("does not replay exhausted schedule services across pages", async () => {
    const calls = { primary: [] as string[], secondary: [] as string[] };
    const jobs = {
      bindings: [
        scheduleBinding("primary", async (query) => {
          calls.primary.push(typeof query.cursor === "string" ? query.cursor : "first");
          return { schedules: [{ id: "primary-1" }] };
        }),
        scheduleBinding("secondary", async (query) => {
          calls.secondary.push(typeof query.cursor === "string" ? query.cursor : "first");
          return query.cursor === undefined
            ? { schedules: [{ id: "secondary-1" }], nextCursor: "secondary-next" }
            : { schedules: [{ id: "secondary-2" }] };
        }),
      ],
    } satisfies InspectorJobsServices;
    const server = app(jobs);
    const first = await server.request(`${API_BASE_PATH}/jobs/schedules?limit=1`);
    const firstBody = await first.json();
    const second = await server.request(
      `${API_BASE_PATH}/jobs/schedules?limit=1&cursor=${firstBody.nextCursor}`,
    );
    const secondBody = await second.json();
    expect(firstBody.hasMore).toBe(true);
    expect(secondBody.items).toEqual([{ schedule: { id: "secondary-2" }, service: "secondary" }]);
    expect(calls.primary).toEqual(["first"]);
    expect(calls.secondary).toEqual(["first", "secondary-next"]);
  });
});
