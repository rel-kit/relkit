import { expect, test } from "vitest";
import { Effect } from "effect";
import { generateOpenApiEffect } from "../src/generate.js";
import { observeOpenApi } from "../src/generate-observability.js";
import { graph } from "./generate-fixture.js";

test("the live observer gives each operation a stable span name", () => {
  const spanName = Effect.runSync(
    observeOpenApi(
      "path",
      Effect.map(Effect.currentSpan, (span) => span.name),
    ),
  );
  expect(spanName).toBe("openapi.path");
});

test("typed failures retain structured graph context", () => {
  const source = graph(false);
  const missing = { ...source, nodes: source.nodes.filter((node) => node.kind !== "function") };
  const targetError = Effect.runSync(Effect.flip(generateOpenApiEffect(missing)));
  expect(targetError).toMatchObject({
    reason: "missing-function",
    triggerId: "orders.get",
    targetFunctionId: "orders.get",
  });
  const route = source.nodes.find((node) => node.kind === "trigger");
  if (route?.kind !== "trigger") throw new Error("invalid fixture");
  const duplicate = { ...source, nodes: [...source.nodes, route] };
  const routeError = Effect.runSync(Effect.flip(generateOpenApiEffect(duplicate)));
  expect(routeError).toMatchObject({
    reason: "duplicate-route",
    method: "GET",
    path: "/orders/{id}",
  });
});
