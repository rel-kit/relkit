/**
 * Exercises footprint accounting and exact dependency-path admission independently
 * of package managers. Shared physical installs count once, while bundled SDKs
 * and unapproved paths remain visible to both stage policies.
 */
import { expect, it } from "vitest";
import { accountDependencies, dependencyViolations } from "../consumer-dependency-policy.js";

const shared = {
  name: "effect",
  version: "4.0.1",
  physicalPath: "/fixture/node_modules/effect",
  logicalBytes: 120,
  physicalBytes: 128,
  archive: { identity: "effect@4.0.1", bytes: 60 },
  nativeFiles: [],
};

it("shared_instance_counted_once", () => {
  expect(accountDependencies([shared, shared])).toEqual({
    physicalInstances: 1,
    archiveBytes: 60,
    logicalBytes: 120,
    physicalBytes: 128,
    nativeFiles: [],
  });
});

it("counts separate installations but downloads one archive", () => {
  const second = { ...shared, physicalPath: "/fixture/nested/node_modules/effect" };
  expect(accountDependencies([shared, second])).toMatchObject({
    physicalInstances: 2,
    archiveBytes: 60,
    logicalBytes: 240,
    physicalBytes: 256,
  });
});

it("bundled_sdk_still_counted", () => {
  const path = { boundary: "artifact", packages: ["@relkit/cli", "langchain"] } as const;
  expect(dependencyViolations([path], { stage: "1", exceptions: [] })).toEqual([path]);
});

it("creator_before_application_install", () => {
  const path = {
    boundary: "installation",
    packages: ["create-relkit", "@pulumi/pulumi"],
  } as const;
  expect(dependencyViolations([path], { stage: "1", exceptions: [] })).toEqual([path]);
});

it("stage1_exception_requires_exact_path", () => {
  const admitted = { boundary: "installation", packages: ["@relkit/cli", "react"] } as const;
  const forbidden = { boundary: "installation", packages: ["@relkit/client", "react"] } as const;
  const extraHop = {
    boundary: "installation",
    packages: ["@relkit/cli", "@relkit/client", "react"],
  } as const;
  const policy = { stage: "1", exceptions: [admitted] } as const;
  expect(dependencyViolations([admitted, forbidden, extraHop], policy)).toEqual([
    forbidden,
    extraHop,
  ]);
});

it("does not admit a declaration or artifact through an install exception", () => {
  const installed = { boundary: "installation", packages: ["@relkit/cli", "react"] } as const;
  const declaration = { ...installed, boundary: "declarations" } as const;
  expect(dependencyViolations([declaration], { stage: "1", exceptions: [installed] })).toEqual([
    declaration,
  ]);
});

it("final_forbidden_family_fails", () => {
  const path = { boundary: "installation", packages: ["@relkit/cli", "react"] } as const;
  expect(dependencyViolations([path], { stage: "final", exceptions: [path] })).toEqual([path]);
});

it("refuses a non-inspector path even when listed as a stage-one exception", () => {
  const path = { boundary: "installation", packages: ["@relkit/cli", "langchain"] } as const;
  expect(dependencyViolations([path], { stage: "1", exceptions: [path] })).toEqual([path]);
});

it.each([
  "@aws-sdk/client-s3",
  "@smithy/core",
  "ioredis",
  "@sentry/node",
  "@opentelemetry/sdk-trace-base",
  "@opentelemetry/exporter-trace-otlp-http",
  "inngest",
  "effect-mq",
  "@trigger.dev/sdk",
  "postgres",
  "@libsql/client",
])("rejects an unselected capability SDK: %s", (name) => {
  for (const boundary of ["installation", "evaluation", "declarations", "artifact"] as const) {
    const path = { boundary, packages: ["consumer", "@relkit/cli", name] };
    for (const stage of ["1", "final"] as const)
      expect(dependencyViolations([path], { stage, exceptions: [path] })).toEqual([path]);
  }
});

it("keeps essential transport infrastructure and the lightweight telemetry API allowed", () => {
  for (const name of ["effect", "hono", "@orpc/server", "@opentelemetry/api"])
    expect(
      dependencyViolations([{ boundary: "installation", packages: ["consumer", name] }], {
        stage: "final",
        exceptions: [],
      }),
    ).toEqual([]);
});

it("requires each expanded legacy path and rejects unrelated SDK descendants", () => {
  const ui = {
    boundary: "installation",
    packages: ["consumer", "@relkit/cli", "next", "react"],
  } as const;
  const native = {
    boundary: "installation",
    packages: [
      "consumer",
      "@relkit/cli",
      "@relkit/observability-local",
      "@duckdb/node-api",
      "@duckdb/node-bindings",
    ],
  } as const;
  const unrelated = { ...ui, packages: [...ui.packages, "langchain"] } as const;
  const policy = { stage: "1", exceptions: [ui, native, unrelated] } as const;
  expect(dependencyViolations([ui, native, unrelated], policy)).toEqual([unrelated]);
  expect(dependencyViolations([ui, native], { stage: "1", exceptions: [] })).toEqual([ui, native]);
  expect(dependencyViolations([ui, native], { stage: "final", exceptions: [ui, native] })).toEqual([
    ui,
    native,
  ]);
});

it("does not hide unmeasured compressed or allocated bytes", () => {
  expect(accountDependencies([{ ...shared, archive: null, physicalBytes: null }])).toMatchObject({
    archiveBytes: null,
    physicalBytes: null,
  });
});

it("rejects inconsistent observations for the same physical installation", () => {
  expect(() => accountDependencies([shared, { ...shared, version: "4.0.2" }])).toThrow(
    /Conflicting/,
  );
});
