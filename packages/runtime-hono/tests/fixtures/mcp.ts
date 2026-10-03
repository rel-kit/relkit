import { createApp } from "../../src/index.ts";
import { runtimeCohort } from "../test-cohort.ts";
import { input, output, tool, toolPlan } from "./mcp-setup.ts";
const plan = toolPlan([tool("echo", true, "never")]);
const app = createApp({
  plan,
  manifest: {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    middleware: {},
    requestTransforms: {},
    tools: { echo: { target: { input, output } } },
  },
  engine: { invoke: async () => ({ echoed: "hello" }) },
});
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
process.send?.({ port: server.port });
process.once("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});
