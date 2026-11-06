/**
 * Exercises data-only tooling normalization, ordered validation issues and
 * migration guidance without executing application configuration or transports.
 */
import { expect, it } from "@effect/vitest";
import {
  CONFIG_CODES,
  ConfigValidationError,
  loadConfig,
  validateConfig,
} from "../../src/compiler/index.js";

it("uses fixed project conventions and typed server defaults", () => {
  const input = {
    server: {
      port: 4100,
      maxBodyBytes: 2_000_000,
      apiDocs: { enabledInProduction: true, excludeDomains: ["navigation", "auth"] },
    },
    inspector: { enabled: true, connection: { port: 4210 } },
  } as const;
  const config = loadConfig(input, "/workspace/app");

  expect(config).toMatchObject({
    projectRoot: "/workspace/app",
    source: ["src/**/*.ts"],
    generatedDirectory: ".relkit/generated",
    server: {
      port: 4100,
      maxBodyBytes: 2_000_000,
      apiDocs: { enabledInProduction: true, excludeDomains: ["navigation", "auth"] },
    },
    inspector: { enabled: true, connection: { host: "127.0.0.1", port: 4210 } },
  });
  expect(config.exclude).toEqual(
    expect.arrayContaining(["src/**/*.test.ts", "src/**/*.d.ts", "src/**/__fixtures__/**"]),
  );
});

it("rejects legacy keys with direct migration guidance", () => {
  const issues = validateConfig(
    {
      entry: "custom.ts",
      source: ["lib/**/*.ts"],
      exclude: [],
      generatedDirectory: "build/generated",
    },
    "/workspace/app",
  );

  expect(issues.map(({ code }) => code)).toEqual([
    CONFIG_CODES.legacy,
    CONFIG_CODES.legacy,
    CONFIG_CODES.legacy,
    CONFIG_CODES.legacy,
  ]);
  expect(issues.map(({ message }) => message).join("\n")).toContain(
    'RelKit discovers descriptors from "src/**/*.ts"',
  );
  expect(() => loadConfig({ server: { port: 0 } }, "/workspace/app")).toThrow(
    ConfigValidationError,
  );
});

it("rejects invalid API docs domain exclusions", () => {
  for (const excludeDomains of ["navigation", [""], ["  "], [1], null]) {
    expect(
      validateConfig({ server: { apiDocs: { excludeDomains } } }, "/workspace/app"),
    ).toContainEqual(expect.objectContaining({ path: "server.apiDocs.excludeDomains" }));
  }
});

it("accepts singular provider keys and rejects removed plural keys", () => {
  expect(
    validateConfig({ bucket: {}, cache: {}, job: {}, event: {}, model: {} }, "/workspace/app"),
  ).toEqual([]);
  expect(validateConfig({ buckets: {} }, "/workspace/app")).toContainEqual(
    expect.objectContaining({ code: CONFIG_CODES.key, path: "buckets" }),
  );
  expect(validateConfig({ observability: {} }, "/workspace/app")).toContainEqual(
    expect.objectContaining({ code: CONFIG_CODES.key, path: "observability" }),
  );
});

it("accepts generic deployment roles and rejects the removed AWS/Pulumi shape", () => {
  expect(
    loadConfig({ deployment: { engine: "pulumi", host: "aws" } }, "/workspace/app").deployment,
  ).toEqual({ engine: "pulumi", host: "aws" });
  expect(
    validateConfig({ deployment: { target: "aws", adapter: "pulumi" } }, "/workspace/app"),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "deployment.target", code: CONFIG_CODES.key }),
      expect.objectContaining({ path: "deployment.adapter", code: CONFIG_CODES.key }),
      expect.objectContaining({ path: "deployment.engine", code: CONFIG_CODES.behavior }),
      expect.objectContaining({ path: "deployment.host", code: CONFIG_CODES.behavior }),
    ]),
  );
});

it("enables the unused-errors check only when configured", () => {
  expect(loadConfig({}, "/workspace/app").check).toBeUndefined();
  expect(loadConfig({ check: { unusedErrors: false } }, "/workspace/app").check).toBeUndefined();
  expect(loadConfig({ check: { unusedErrors: true } }, "/workspace/app").check).toEqual({
    unusedErrors: true,
  });
  expect(
    validateConfig({ check: { unusedErrors: "yes", strict: true } }, "/workspace/app").map(
      ({ path }) => path,
    ),
  ).toEqual(["check.strict", "check.unusedErrors"]);
});

it("reads server.mcp as a boolean or as an auth requirement", () => {
  expect(loadConfig({}, "/workspace/app").server).toMatchObject({ mcp: false });
  expect(loadConfig({ server: { mcp: true } }, "/workspace/app").server.mcpAuth).toBeUndefined();
  expect(
    loadConfig({ server: { mcp: { auth: "required" } } }, "/workspace/app").server,
  ).toMatchObject({ mcp: true, mcpAuth: "required" });
  expect(
    validateConfig({ server: { mcp: { auth: "optional" } } }, "/workspace/app").map(
      ({ path }) => path,
    ),
  ).toEqual(["server.mcp"]);
});
