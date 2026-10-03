import type { RegistrationPlan } from "@relkit/graph";
import type { RuntimeManifest } from "../../src/index.ts";
import { runtimeCohort } from "../test-cohort.ts";

export const schema = {
  "~standard": {
    version: 1 as const,
    vendor: "relkit-test",
    validate: (value: unknown) => ({ value }),
  },
};

export function queryPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:websocket",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "query.route",
        source: { file: "route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "query",
        config: {
          method: "GET",
          path: "/query",
          request: { kind: "input" },
          responses: [],
          middleware: [],
          transforms: [],
          client: { operation: "query" },
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

export function manifest(plan: RegistrationPlan): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: { query: async (input: unknown) => input },
    targets: { query: { input: schema, output: schema, errors: [] } },
    middleware: {},
    requestTransforms: {},
  };
}
