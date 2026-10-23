/** Checks data-only optional HTTP selection before SDK loading or generation. */
import { expect, test } from "vitest";
import { loadConfig, validateConfig } from "../src/index.js";

test("HTTP defaults select neither optional protocol SDKs nor Scalar UI", () => {
  expect(loadConfig({}, "/workspace/app").server).toMatchObject({
    mcp: false,
    agUi: false,
    apiDocs: { ui: false },
  });
});

test("explicit HTTP selectors survive normalized configuration", () => {
  const config = loadConfig(
    { server: { mcp: true, agUi: true, apiDocs: { ui: "scalar" } } },
    "/workspace/app",
  );
  expect(config.server).toMatchObject({ mcp: true, agUi: true, apiDocs: { ui: "scalar" } });
});

test("invalid selectors report exact properties without changing inspector configuration", () => {
  const issues = validateConfig(
    { server: { agUi: "yes", apiDocs: { ui: "other" } } },
    "/workspace/app",
  );
  expect(issues.map((issue) => issue.path)).toContain("server.agUi");
  expect(issues.map((issue) => issue.path)).toContain("server.apiDocs.ui");
  expect(loadConfig({}, "/workspace/app").inspector).toMatchObject({
    port: 3210,
    enabledInProduction: false,
  });
});
