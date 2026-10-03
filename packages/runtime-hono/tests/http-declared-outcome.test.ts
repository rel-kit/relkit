import { expect, test } from "vitest";
import { Hono } from "hono";
import { createObservabilityCollector } from "@relkit/observability";
import { createFrameworkMiddleware } from "../src/middleware.js";
import { getRequestState } from "../src/middleware-utils.js";

test.each([true, false])("preserves declared 500 outcomes with body=%s", async (body) => {
  const collector = createObservabilityCollector();
  const app = new Hono();
  for (const middleware of createFrameworkMiddleware({ observability: collector })) {
    app.use("*", middleware.handler);
  }
  app.get("/declared", (context) => {
    getRequestState(context)?.requestRecord?.setOutcome("declared-error", "demo.example-error");
    return new Response(body ? "declared" : null, { status: 500 });
  });
  await (await app.request("http://localhost/declared")).text();
  const completed = collector
    .read()
    .find((record) => record.signal === "request" && record.phase === "completed");
  expect(completed).toMatchObject({
    outcome: "declared-error",
    status: 500,
    errorId: "demo.example-error",
  });
  expect(
    collector.read().find((record) => record.signal === "span" && record.status === "completed"),
  ).toMatchObject({ attributes: { "relkit.outcome": "declared-error" } });
});
