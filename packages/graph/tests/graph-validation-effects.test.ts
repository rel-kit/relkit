import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  GraphValidationError,
  validateGraphShape,
  validateGraphShapeEffect,
} from "../src/index.js";
import { validateNodeEffect } from "../src/graph-validation-node.js";
import { appNode, functionNode, graph, httpTrigger } from "./graph-fixtures.js";
function validationMessage(value: unknown): string {
  const error = Effect.runSync(Effect.flip(validateGraphShapeEffect(value)));
  expect(error).toBeInstanceOf(GraphValidationError);
  return error.message;
}
describe("typed graph validation", () => {
  test("accepts a minimal valid graph and the synchronous adapter", () => {
    const value = graph([appNode(), functionNode()]);
    expect(Effect.runSync(validateGraphShapeEffect(value))).toBeUndefined();
    expect(() => validateGraphShape(value)).not.toThrow();
  });
  test("rejects document shape and canonical identity failures by tag", () => {
    expect(validationMessage({ nodes: [], edges: [] })).toContain("contract version");
    expect(validationMessage({ contractVersion: 3, nodes: null, edges: [] })).toContain(
      "nodes and edges",
    );
    expect(validationMessage({ ...graph(), appId: "bad/id" })).toContain("appId");
    expect(validationMessage({ ...graph(), appId: "unbound.orders" })).toContain(
      "canonical identity",
    );
    expect(() => validateGraphShape({ ...graph(), appId: "bad/id" })).toThrow(TypeError);
  });
  test("validates HTTP middleware, transform, and rate-limit identities", () => {
    const route = httpTrigger();
    const base = route.config as Record<string, unknown>;
    expect(
      validationMessage(
        graph([
          httpTrigger({
            config: {
              ...base,
              middleware: [{ id: "bad/id", path: "*", order: 0, match: "always" }],
            },
          }),
        ]),
      ),
    ).toContain("middleware[0].id");
    expect(
      validationMessage(
        graph([httpTrigger({ config: { ...base, transforms: [{ id: "bad/id" }] } })]),
      ),
    ).toContain("transforms[0].id");
    expect(
      validationMessage(
        graph([httpTrigger({ config: { ...base, rateLimit: { storeId: "bad/id" } } })]),
      ),
    ).toContain("rateLimit.storeId");
    expect(
      validationMessage(
        graph([
          httpTrigger({
            config: {
              ...base,
              middleware: [{ id: "orders.auth", path: 4, order: 0, match: "always" }],
            },
          }),
        ]),
      ),
    ).toContain("middleware[0] is invalid");
    expect(
      validationMessage(graph([httpTrigger({ config: { ...base, middleware: [null] } })])),
    ).toContain("middleware[0] is invalid");
    expect(
      validationMessage(
        graph([
          httpTrigger({
            config: {
              ...base,
              transforms: [{ id: "orders.normalize", targetFunctionId: "bad/id" }],
            },
          }),
        ]),
      ),
    ).toContain("transforms[0].targetFunctionId");
  });
  test("exposes a typed node validator directly", () => {
    const error = Effect.runSync(
      Effect.flip(validateNodeEffect(functionNode({ exposure: "secret" }), undefined, 0)),
    );
    expect(error).toBeInstanceOf(GraphValidationError);
    expect(error.operation).toBe("validation.node");
  });
  test("keeps unexpected source getter defects outside the validation error channel", () => {
    const defect = new Error("source getter failed");
    const node = {
      kind: "function",
      id: "orders.create",
      get source(): never {
        throw defect;
      },
    };
    expect(() => Effect.runSync(validateNodeEffect(node, undefined, 0))).toThrow(defect);
    expect(() => validateGraphShape(graph([node]))).toThrow(defect);
  });
});
