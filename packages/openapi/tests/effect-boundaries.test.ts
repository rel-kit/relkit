import { expect, test } from "vitest";
import { Effect, Layer, Metric } from "effect";
import type { FunctionNode } from "@relkit/graph";
import {
  generateOpenApi,
  generateOpenApiEffect,
  generateOpenApiJson,
  generateOpenApiJsonEffect,
  OpenApiGenerationError,
  OpenApiTelemetry,
} from "../src/index.js";
import { buildRequestEffect } from "../src/generate-request.js";
import { buildResponsesEffect } from "../src/generate-response.js";
import { serviceContextEffect, serviceForEffect } from "../src/generate-services.js";
import {
  documentTagsEffect,
  operationTagsEffect,
  serviceTagNamesEffect,
} from "../src/generate-tags.js";
import { openApiPathEffect } from "../src/generate-utils.js";
import { graph } from "./generate-fixture.js";

function target(): FunctionNode {
  const node = graph(false).nodes.find((candidate) => candidate.kind === "function");
  if (node?.kind !== "function") throw new Error("missing test function");
  return node;
}

test("Effect and synchronous adapters agree, including typed failure and old TypeError", () => {
  const source = graph(false);
  expect(Effect.runSync(generateOpenApiEffect(source))).toEqual(generateOpenApi(source));
  expect(Effect.runSync(generateOpenApiJsonEffect(source))).toBe(generateOpenApiJson(source));

  const missing = { ...source, nodes: source.nodes.filter((node) => node.kind !== "function") };
  const error = Effect.runSync(Effect.flip(generateOpenApiEffect(missing)));
  expect(error).toBeInstanceOf(OpenApiGenerationError);
  expect(error.reason).toBe("missing-function");
  expect(() => generateOpenApi(missing)).toThrow(TypeError);
  expect(() => generateOpenApiJson(missing)).toThrow("targets missing function");

  const trigger = source.nodes.find((node) => node.kind === "trigger");
  if (trigger?.kind !== "trigger") throw new Error("missing test trigger");
  const duplicate = { ...source, nodes: [...source.nodes, trigger] };
  expect(Effect.runSync(Effect.flip(generateOpenApiEffect(duplicate))).reason).toBe(
    "duplicate-route",
  );
  expect(() => generateOpenApi(duplicate)).toThrow(TypeError);
});

test("injected Layer observes nested operations and typed failure", () => {
  const observed: string[] = [];
  const telemetry = Layer.succeed(OpenApiTelemetry, {
    observe: <A, E, R>(operation: string, effect: Effect.Effect<A, E, R>) => {
      observed.push(operation);
      return effect;
    },
  });
  const source = graph(false);
  Effect.runSync(Effect.provide(generateOpenApiEffect(source), telemetry));
  expect(observed).toContain("generate");
  expect(observed).toContain("request");
  expect(observed).toContain("responses");
  expect(observed).toContain("services.index");
  expect(observed).toContain("tags.document");
  expect(observed).toContain("path");
  const missing = { ...source, nodes: source.nodes.filter((node) => node.kind !== "function") };
  Effect.runSync(Effect.provide(Effect.flip(generateOpenApiEffect(missing)), telemetry));
  expect(observed.filter((name) => name === "generate")).toHaveLength(2);
});

test("live telemetry counts success and failure with bounded labels", () => {
  const calls = Metric.withAttributes(Metric.counter("relkit_openapi_operations_total"), {
    operation: "generate",
  });
  const failures = Metric.withAttributes(Metric.counter("relkit_openapi_failures_total"), {
    operation: "generate",
  });
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_openapi_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
    }),
    { operation: "generate" },
  );
  const source = graph(false);
  const before = Effect.runSync(
    Effect.gen(function* () {
      return [
        (yield* Metric.value(calls)).count,
        (yield* Metric.value(failures)).count,
        (yield* Metric.value(duration)).count,
      ] as const;
    }),
  );
  generateOpenApi(source);
  const missing = { ...source, nodes: source.nodes.filter((node) => node.kind !== "function") };
  expect(() => generateOpenApi(missing)).toThrow();
  const after = Effect.runSync(
    Effect.gen(function* () {
      return [
        (yield* Metric.value(calls)).count,
        (yield* Metric.value(failures)).count,
        (yield* Metric.value(duration)).count,
      ] as const;
    }),
  );
  expect(after).toEqual([before[0] + 2, before[1] + 1, before[2] + 2]);
});

test("request mapping covers nested wrappers, inferred parameters, media types and whole bodies", () => {
  const request = Effect.runSync(
    buildRequestEffect(
      {
        kind: "input",
        fields: {
          nested: {
            kind: "nested",
            fields: {
              query: { kind: "default", value: { kind: "query" } },
              cookie: { kind: "transform", value: { kind: "cookie", name: "session" } },
            },
          },
          stale: { kind: "path", name: "old" },
          payload: { kind: "body", name: "payload" },
          file: { kind: "multipart", name: "file" },
        },
      },
      {
        type: "object",
        properties: {
          nested: {
            type: "object",
            properties: { query: { type: "integer" }, cookie: { type: "string" } },
          },
          payload: { type: "object" },
          file: { type: "string", format: "binary" },
        },
      },
      "/files/:id/*rest",
    ),
  );
  expect(request.parameters.map((entry) => `${entry.in}:${entry.name}`)).toEqual([
    "cookie:session",
    "path:id",
    "path:rest",
    "query:query",
  ]);
  expect(request.parameters.find((entry) => entry.name === "query")?.required).toBe(false);
  expect(Object.keys(request.body?.content ?? {})).toEqual([
    "application/json",
    "multipart/form-data",
  ]);
  const whole = Effect.runSync(buildRequestEffect({ kind: "whole-body" }, { type: "array" }, "/"));
  expect(whole.body?.content["application/json"]?.schema).toEqual({ type: "array" });
  expect(Effect.runSync(buildRequestEffect(null, null, "/")).body).toBeUndefined();
});

test("response projection merges statuses, omits no-content schema and adds validation", () => {
  const responses = Effect.runSync(
    buildResponsesEffect(
      [
        { kind: "success", id: "a", status: 200, schema: { type: "string" } },
        { kind: "success", id: "b", status: 200, schema: { type: "number" } },
        { kind: "success", id: "empty", status: 204, schema: { type: "string" } },
        { kind: "error", id: "other", status: 400, schema: null },
      ],
      target(),
    ),
  );
  expect(responses["200"]?.content?.["application/json"]?.schema).toEqual({
    oneOf: [{ type: "string" }, { type: "number" }],
  });
  expect(responses["204"]?.content).toBeUndefined();
  expect(responses["422"]?.description).toBe("Validation error");
  expect(responses["400"]?.content?.["application/json"]?.schema).toMatchObject({
    properties: { code: { const: "other" }, retry: { enum: ["never", "later"] } },
  });
});
test("service and tag Effects resolve explicit and synthetic services", () => {
  const source = graph(false);
  const context = Effect.runSync(serviceContextEffect(source));
  const trigger = source.nodes.find((node) => node.kind === "trigger");
  if (trigger?.kind !== "trigger" || trigger.triggerType !== "http")
    throw new Error("missing route");
  expect(Effect.runSync(serviceForEffect(context, trigger, target()))?.id).toBe("orders");
  const synthetic = Effect.runSync(
    serviceForEffect(
      { byId: new Map(), byFunction: new Map(), sources: [] },
      { ...trigger, serviceId: "other" },
      target(),
    ),
  );
  expect(synthetic?.id).toBe("other");
  expect(Effect.runSync(serviceTagNamesEffect({ id: "plain" }))).toEqual(["plain"]);
  expect(Effect.runSync(operationTagsEffect(undefined, ["read", "read", ""]))).toEqual(["read"]);
  expect(Effect.runSync(documentTagsEffect([{ id: "plain", title: "Plain" }], ["read"]))).toEqual([
    { name: "plain", description: "Plain" },
    { name: "read" },
  ]);
  expect(Effect.runSync(openApiPathEffect("/*"))).toBe("/{wildcard1}");
});
