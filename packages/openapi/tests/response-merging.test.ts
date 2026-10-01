import { expect, test } from "vitest";
import { generateOpenApi } from "../src/generate.js";
import { graph } from "./generate-fixture.js";

test("duplicate 429 responses retain rate-limit headers with either merge order", () => {
  for (const id of ["custom.429", "z-custom.429"]) {
    for (const schema of [null, { type: "string" }]) {
      const source = graph(false);
      const trigger = source.nodes.find((node) => node.kind === "trigger");
      if (trigger?.kind !== "trigger") throw new Error("invalid fixture");
      Object.assign(trigger.config, {
        responses: [
          ...trigger.config.responses,
          { kind: "response", id: "rate-limit.429", status: 429 },
          { kind: "response", id, status: 429, schema },
        ],
      });

      const response = generateOpenApi(source).paths["/orders/{id}"]?.get?.responses["429"];
      expect(Object.keys(response?.headers ?? {})).toEqual([
        "RateLimit-Policy",
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
        "Retry-After",
      ]);
      expect(response?.content?.["application/json"]?.schema).toBeDefined();
    }
  }
});
