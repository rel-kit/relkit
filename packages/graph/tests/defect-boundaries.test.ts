import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { JsonValueError, SourceLocationError } from "@relkit/contracts";
import { assertProductionGraph, createRegistrationPlan } from "../src/index.js";
import { validateEventTargets } from "../src/event-validation.js";
import { runValidation, validationEffect } from "../src/graph-validation-error.js";
import { knownFailure, runHash } from "../src/hash-errors.js";
import { graph, source } from "./graph-fixtures.js";
describe("unexpected graph defects", () => {
  test("keeps an unexpected validator exception outside the domain error channel", () => {
    const defect = new Error("unexpected getter");
    const operation = validationEffect("validation.node", () => {
      throw defect;
    });
    expect(() => Effect.runSync(operation)).toThrow(defect);
    expect(() => runValidation(Effect.die(defect))).toThrow(defect);
  });
  test("preserves contract errors and unexpected hash defects", () => {
    const invalidJson = new JsonValueError("$", "unsupported");
    expect(() => runHash(Effect.fail(invalidJson))).toThrow(invalidJson);
    expect(() => Effect.runSync(knownFailure(new Error("crypto defect")))).toThrow("crypto defect");
    const invalidSource = { file: "../outside.ts", line: 1, column: 1 };
    const value = graph([{ kind: "app", id: "orders", source: invalidSource }]);
    expect(() => createRegistrationPlan(value)).toThrow(SourceLocationError);
  });
  test("keeps unexpected production and event traversal defects unchanged", () => {
    const defect = new Error("node traversal defect");
    const malicious = {
      get nodes(): never {
        throw defect;
      },
      edges: [],
    } as never;
    expect(() => assertProductionGraph(malicious)).toThrow(defect);
    expect(() => validateEventTargets(malicious)).toThrow(defect);
  });
});
