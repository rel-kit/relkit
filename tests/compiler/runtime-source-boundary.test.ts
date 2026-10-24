/** Checks emitted integration metadata remains inert when source is embedded in a JavaScript host. */
import { expect, test } from "bun:test";
import { generateRuntimeIntegrationImports } from "../../packages/compiler/src/index.ts";
import { planEntry } from "./runtime-integration-plan.fixture.js";

test("integration metadata cannot terminate an enclosing script", () => {
  const source = generateRuntimeIntegrationImports({
    version: 1,
    graphHash: "sha256:graph",
    integrations: [{ ...planEntry("redis", "cache", "redis"), packageVersion: "1.0.0</script>" }],
  });
  expect(source).not.toContain("</script>");
  expect(source).toContain("1.0.0\\u003c/script>");
  expect(source).toContain('await import("@relkit/redis/runtime")');
});
