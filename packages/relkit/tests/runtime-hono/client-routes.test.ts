import { expect, test } from "vitest";
import { createApp } from "../../src/runtime-hono/index.js";
import { manifest, queryPlan } from "./fixtures/query-plan.ts";

test("the client routes document lists each client route with its API path and mapping", async () => {
  const base = queryPlan();
  const plan = {
    ...base,
    httpTriggers: [
      ...base.httpTriggers,
      {
        ...base.httpTriggers[0]!,
        id: "hidden.route",
        config: { ...base.httpTriggers[0]!.config, path: "/hidden", client: false as const },
      },
    ],
  };
  const app = createApp({ plan, manifest: manifest(plan), engine: { invoke: async () => ({}) } });
  const response = await app.request("/_relkit/v1/client/routes");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    protocol: "relkit.client-routes",
    version: 1,
    routes: [
      {
        id: "query.route",
        api: ["query"],
        method: "GET",
        path: "/query",
        request: base.httpTriggers[0]!.config.request,
        stream: null,
        operation: "query",
        errors: [],
      },
    ],
  });
});
