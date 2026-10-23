/** Keeps public test helpers distinct from integration definitions without losing SDK metadata. */
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { CompilerPackageSource } from "../src/integration-package-source.js";
import { resolveRuntimeIntegrationPackagesEffect } from "../src/integration-package-resolution.js";

const requirement = {
  package: "fixture-sdk",
  supportedRange: "1.0.0",
  installSection: "dependencies",
  capabilities: ["agent-execution"],
  phases: ["check", "runtime"],
};
const manifest = {
  name: "@fixture/agents",
  version: "1.0.0",
  exports: { ".": "./index.js", "./testing": "./testing.js", "./runtime": "./runtime.js" },
  relkit: {
    integration: {
      id: "agents",
      dependencies: [requirement],
      exports: {
        authoring: ".",
        runtime: {
          export: "./runtime",
          registrations: [
            { capability: "agent-execution", adapterId: "agents", protocolVersion: 1 },
          ],
        },
      },
    },
  },
};
const source = Layer.succeed(CompilerPackageSource, {
  resolve: () => Effect.succeed("/package/index.js"),
  canonical: (path) => Effect.succeed(path),
  exists: () => Effect.succeed(true),
  readManifest: () => Effect.succeed(manifest),
});

it.effect("application testing helpers retain the selected runtime and native requirements", () =>
  Effect.gen(function* () {
    const packages = yield* resolveRuntimeIntegrationPackagesEffect({
      projectRoot: "/app",
      imports: [],
      applicationImports: ["@fixture/agents/testing"],
    });
    expect(packages).toMatchObject([
      {
        integrationId: "agents",
        exportName: "./runtime",
        requirements: [requirement],
      },
    ]);
  }).pipe(Effect.provide(source)),
);

it.effect(
  "strict configuration imports win when the same helper also appears in application source",
  () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        resolveRuntimeIntegrationPackagesEffect({
          projectRoot: "/app",
          imports: ["@fixture/agents/testing"],
          applicationImports: ["@fixture/agents/testing"],
        }),
      );
      expect(String(failure.cause)).toContain("not an authoring export");
    }).pipe(Effect.provide(source)),
);

it.effect("application source cannot import runtime or undeclared testing namespaces", () =>
  Effect.gen(function* () {
    for (const specifier of ["@fixture/agents/runtime", "@fixture/agents/testing/private"]) {
      const failure = yield* Effect.flip(
        resolveRuntimeIntegrationPackagesEffect({
          projectRoot: "/app",
          imports: [],
          applicationImports: [specifier],
        }),
      );
      expect(String(failure.cause)).toContain("not an authoring export");
    }
  }).pipe(Effect.provide(source)),
);

it.effect(
  "a testing helper still requires a declared package export and valid authoring metadata",
  () =>
    Effect.gen(function* () {
      for (const invalid of [
        { ...manifest, exports: { ".": "./index.js", "./runtime": "./runtime.js" } },
        { ...manifest, relkit: { integration: { exports: { authoring: "../invalid" } } } },
      ]) {
        const failure = yield* Effect.flip(
          resolveRuntimeIntegrationPackagesEffect({
            projectRoot: "/app",
            imports: [],
            applicationImports: ["@fixture/agents/testing"],
          }).pipe(
            Effect.provideService(CompilerPackageSource, {
              resolve: () => Effect.succeed("/package/index.js"),
              canonical: (path) => Effect.succeed(path),
              exists: () => Effect.succeed(true),
              readManifest: () => Effect.succeed(invalid),
            }),
          ),
        );
        expect(failure._tag).toBe("IntegrationPackageValidationError");
      }
    }),
);
