import { type JobsAdapterRuntime } from "@relkit/jobs";
import type { RegistrationPlan } from "@relkit/graph";

import { type RuntimeManifest } from "../../src/index.ts";
import { runtimeCohort } from "../test-cohort.ts";

export function fakeAdapter(
  onSubmit: (request: Parameters<JobsAdapterRuntime["submit"]>[0]) => void,
  onList: (query: Parameters<JobsAdapterRuntime["list"]>[0]) => void,
): JobsAdapterRuntime {
  return {
    kind: "jobs-adapter-runtime",
    protocolVersion: 1,
    capabilities: {
      service: "local",
      protocolVersion: 1,
      features: { submission: true, read: true, list: true, observation: true, cancel: true },
    },
    submit: async (request) => {
      onSubmit(request);
      return {
        accepted: true,
        runId: "run-1",
        jobId: request.jobId,
        taskId: request.taskId,
        taskVersion: request.taskVersion,
        acceptedAt: "2026-01-01T00:00:00.000Z",
      };
    },
    get: async () => runSnapshot(),
    list: async (query) => {
      onList(query);
      return {
        items: [runSnapshot()],
        nextCursor: "native-1",
        hasMore: true,
        availability: [{ service: "local", state: "available" }],
      };
    },
    observe: async function* () {
      yield {
        kind: "snapshot",
        run: runSnapshot(),
        observedAt: "2026-01-01T00:00:00.000Z",
        epoch: "epoch-1",
        sequence: 1,
        continuity: "state",
      };
    },
    cancel: async () => ({
      runId: "run-1",
      operationId: "operation-1",
      outcome: "already-terminal",
      run: runSnapshot(),
    }),
    close: async () => {},
  };
}

function runSnapshot() {
  return {
    accepted: true as const,
    runId: "run-1",
    jobId: "orders.export",
    taskId: "orders.export",
    taskVersion: "1",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    buildId: "1",
    service: "local",
    scope: "public:fixture",
    status: "completed" as const,
    observedAt: "2026-01-01T00:00:01.000Z",
    resultAvailability: "available" as const,
    input: 7,
    progress: { completed: 1 },
    output: { url: "https://example.test/export.csv" },
  };
}

export function jobPlan(job: {
  readonly id: string;
  readonly name: string;
  readonly task: {
    readonly id: string;
    readonly version: string;
    readonly ref: { readonly id: string };
  };
}): RegistrationPlan {
  return {
    graphHash: "sha256:jobs",
    functions: [],
    httpTriggers: [],
    tasks: [],
    jobs: [
      {
        kind: "job",
        id: job.id,
        source: { file: "job.ts", line: 1, column: 1 },
        executionModel: "task",
        name: job.name,
        jobId: job.id,
        taskId: job.task.ref.id,
        taskVersion: job.task.version,
        profile: "local",
        implicit: false,
        default: true,
        input: { type: "string" },
        output: { type: "object", properties: { url: { type: "string" } } },
        progress: { type: "object", properties: { completed: { type: "number" } } },
        client: {
          public: true,
          operations: ["trigger", "get", "list", "watch"],
          fields: ["status", "input", "output", "progress"],
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    channels: [],
    middlewares: [],
  };
}

export function manifest(
  plan: RegistrationPlan,
  job: {
    readonly id: string;
    readonly name: string;
    readonly task: {
      readonly id: string;
      readonly version: string;
      readonly ref: { readonly id: string };
    };
  },
): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    middleware: {},
    requestTransforms: {},
    jobs: { [job.id]: job },
  };
}
