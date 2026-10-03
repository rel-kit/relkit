import type { RegistrationPlan } from "@relkit/graph";
import { createApp } from "../../src/index.ts";
import { runtimeCohort } from "../test-cohort.ts";
const config: { root: string } = JSON.parse(process.env.RELKIT_FIXTURE_CONFIG ?? "{}");
const app = createApp({
  plan: routePlan(),
  manifest: {
    ...runtimeCohort("sha256:static"),
    functions: {},
    middleware: {},
    requestTransforms: {},
  },
  engine: { invoke: async () => ({ declared: true }) },
  mapInput: () => ({}),
  staticFiles: { root: config.root },
});
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
process.send?.({ port: server.port });
process.once("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});

function routePlan(): RegistrationPlan {
  return {
    graphHash: "sha256:static",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "hello.route",
        source: { file: "src/routes/hello.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "hello",
        config: {
          method: "GET",
          path: "/hello.txt",
          request: { kind: "input" },
          responses: [],
          middleware: [],
          transforms: [],
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
