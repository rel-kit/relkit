import { describe, expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber } from "effect";
import {
  parseRouteFilePath,
  parseRouteFilePathEffect,
  routePathToFilePathEffect,
} from "../src/route-file.js";
import {
  generateRuntimeIntegrationPlan,
  generateRuntimeIntegrationPlanEffect,
} from "../src/runtime-integration-plan.js";
import { loadConfig, loadConfigEffect, validateConfigEffect } from "../src/config-loader.js";
import {
  normalizeCompilationEffect,
  normalizeCompilationWithSourcesEffect,
} from "../src/normalize.js";
import { DiscoverySourceReader } from "../src/discovery/source-map-source.js";
import { moduleSnapshot } from "./discovery/source-mapping-fixtures.js";
import { createEvaluatorRequestEffect } from "../src/discovery/evaluator-request.js";
import { evaluateCandidatesEffect } from "../src/discovery/evaluator.js";
import type { EvaluatorOptions } from "../src/discovery/evaluator-request.types.js";
import {
  createRuntimeActivationFingerprint,
  createRuntimeActivationFingerprintEffect,
} from "../src/activation-fingerprint.js";
import {
  generateRuntimeIntegrationImports,
  generateRuntimeIntegrationImportsEffect,
} from "../src/runtime-integration-imports.js";

describe("validation alignment", () => {
  it.effect("retains activation input rejection at both execution boundaries", () =>
    Effect.gen(function* () {
      const input = { graphHash: "hash", manifestSource: " ", runtimeIntegrationsPlanSource: "{}" };
      const failure = yield* Effect.flip(createRuntimeActivationFingerprintEffect(input));
      expect(failure._tag).toBe("ActivationFingerprintError");
      expect(() => createRuntimeActivationFingerprint(input)).toThrow(failure.cause as Error);
    }),
  );

  it.effect("rejects unsafe runtime imports through typed and legacy boundaries", () =>
    Effect.gen(function* () {
      for (const metadata of [
        { packageName: "../unsafe", exportName: "./runtime" },
        { packageName: "safe", exportName: "./../runtime" },
        { packageName: "safe", exportName: "runtime" },
      ]) {
        const plan = {
          version: 1 as const,
          graphHash: "hash",
          integrations: [
            {
              ...metadata,
              packageVersion: "1",
              integrationId: "test",
              capability: "cache" as const,
              adapterId: "test",
              protocolVersion: 1,
            },
          ],
        };
        const failure = yield* Effect.flip(generateRuntimeIntegrationImportsEffect(plan));
        expect(failure._tag).toBe("RuntimeIntegrationImportFailure");
        expect(() => generateRuntimeIntegrationImports(plan)).toThrow(failure.cause as Error);
      }
    }),
  );

  it.effect("rejects route syntax directly and preserves optional catch-all projections", () =>
    Effect.gen(function* () {
      for (const segment of [
        "[bad-name]",
        "[id]/[id]",
        "[...path]/after",
        "@slot",
        "[broken",
        "(group)",
      ]) {
        const path = `src/routes/${segment}/route.ts`;
        const failure = yield* Effect.flip(parseRouteFilePathEffect(path));
        expect(failure._tag).toBe("RouteFileError");
        expect(() => parseRouteFilePath(path)).toThrow(
          String(failure.cause).replace(/^TypeError: /, ""),
        );
      }
      const optional = yield* parseRouteFilePathEffect("src/routes/files/[[...path]]/route.ts");
      expect(optional.runtimePaths).toEqual(["/files", "/files/:path{.+}"]);
      expect(parseRouteFilePath(optional.sourcePath)).toEqual(optional);
      expect((yield* Effect.flip(routePathToFilePathEffect("/bad:name")))._tag).toBe(
        "RouteFileError",
      );
    }),
  );

  it.effect("retains runtime-plan typed failures and legacy error codes", () =>
    Effect.gen(function* () {
      const graph = {
        nodes: [{ kind: "app", id: "app", telemetry: { exporters: { logs: { kind: "wrong" } } } }],
        edges: [],
      };
      const failure = yield* Effect.flip(generateRuntimeIntegrationPlanEffect(graph, "hash"));
      expect(failure._tag).toBe("RuntimeIntegrationPlanFailure");
      expect(failure.cause).toMatchObject({ code: "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID" });
      expect(() => generateRuntimeIntegrationPlan(graph, "hash")).toThrow(failure.cause as Error);
      const provider = {
        nodes: [
          {
            kind: "provider",
            id: "cache",
            capability: "cache",
            adapter: { integrationId: "redis", adapterId: "redis", protocolVersion: 1 },
          },
        ],
        edges: [{ kind: "uses-provider-profile", to: "cache" }],
      };
      expect(
        (yield* Effect.flip(generateRuntimeIntegrationPlanEffect(provider, "hash"))).cause,
      ).toMatchObject({ code: "RELKIT_RUNTIME_INTEGRATION_PACKAGE_MISSING" });
      const owner = {
        integrationId: "redis",
        packageName: "redis",
        packageVersion: "1",
        exportName: "./runtime",
        registrations: [],
      };
      expect(
        (yield* Effect.flip(generateRuntimeIntegrationPlanEffect(provider, "hash", [owner]))).cause,
      ).toMatchObject({ code: "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID" });
      expect(
        (yield* Effect.flip(
          generateRuntimeIntegrationPlanEffect({ nodes: [], edges: [] }, "hash", [
            owner,
            { ...owner, packageName: "other" },
          ]),
        )).cause,
      ).toMatchObject({ code: "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID" });
    }),
  );

  it.effect("preserves complete ordered configuration issues, defaults and UNC roots", () =>
    Effect.gen(function* () {
      const input = {
        unknown: true,
        server: { port: 0, maxBodyBytes: -1, mcp: "yes", extra: true },
        inspector: { port: 70_000 },
      };
      const issues = yield* validateConfigEffect(input, "/project");
      expect(issues.map((issue) => issue.path)).toEqual([
        "inspector.port",
        "server.extra",
        "server.maxBodyBytes",
        "server.mcp",
        "server.port",
        "unknown",
      ]);
      const failure = yield* Effect.flip(loadConfigEffect(input, "/project"));
      expect(failure.cause).toMatchObject({ issues });
      const config = yield* loadConfigEffect({ server: { port: undefined } }, "\\\\server\\share");
      expect(config.projectRoot).toBe("//server/share");
      expect(config.server.port).toBe(3000);
      expect(config).toEqual(loadConfig({}, "//server/share"));
      for (const invalid of [null, [], 1])
        expect((yield* Effect.flip(loadConfigEffect(invalid, "/project")))._tag).toBe(
          "CompilerConfigError",
        );
    }),
  );

  it.effect("honors source injection in normalization without duplicate ownership", () =>
    Effect.gen(function* () {
      let reads = 0;
      const input = {
        projectRoot: "/virtual",
        modules: [moduleSnapshot("src/entry.ts", ["entry"])],
      };
      const operation = normalizeCompilationWithSourcesEffect(input);
      expect(reads).toBe(0);
      const result = yield* operation.pipe(
        Effect.provideService(DiscoverySourceReader, {
          exists: () => Effect.succeed(true),
          read: () =>
            Effect.sync(() => {
              reads++;
              return "\n\nexport const entry = defineFunction({});";
            }),
        }),
      );
      expect(reads).toBe(1);
      expect(result.descriptors[0]?.source.line).toBe(3);
      expect((yield* normalizeCompilationEffect(input)).descriptors[0]?.source.line).toBe(1);
    }),
  );

  it.effect("rejects malformed evaluator options while preserving getter defects", () =>
    Effect.gen(function* () {
      const base = { projectRoot: process.cwd(), candidates: [], generationId: "optional-test" };
      const omitted = yield* createEvaluatorRequestEffect(base);
      const explicit = yield* createEvaluatorRequestEffect({
        ...base,
        timeoutMs: undefined,
        environmentAllowlist: undefined,
        generatedDirectory: undefined,
        networkAllowlist: undefined,
        sourceMaps: undefined,
      });
      expect(explicit).toEqual(omitted);
      for (const options of [null, {}, { generationId: 42, sourceMaps: "invalid" }]) {
        const response = yield* evaluateCandidatesEffect(options as unknown as EvaluatorOptions);
        expect(response.status).toBe("failed");
        expect(response.generationId).toBe("unknown");
        expect(response.failures[0]?.code).toBe("RELKIT_EVALUATOR_REQUEST_INVALID");
      }
      const invalid = yield* Effect.exit(
        createEvaluatorRequestEffect({
          projectRoot: "/tmp",
          candidates: [],
          timeoutMs: "bad" as never,
        }),
      );
      expect(Exit.isFailure(invalid) && Cause.hasFails(invalid.cause)).toBe(true);
      const defect = new Error("option getter bug");
      const broken = yield* Effect.exit(
        createEvaluatorRequestEffect({
          get projectRoot(): string {
            throw defect;
          },
          candidates: [],
        }),
      );
      expect(Exit.isFailure(broken) && Cause.squash(broken.cause)).toBe(defect);
    }),
  );

  it.effect("propagates source-reader interruption after cleanup without later passes", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let cleaned = false;
      const passes: number[] = [];
      const fiber = yield* normalizeCompilationWithSourcesEffect({
        projectRoot: "/virtual",
        modules: [moduleSnapshot("src/entry.ts", ["entry"])],
        onPass: (_pass, index) => passes.push(index),
      }).pipe(
        Effect.provideService(DiscoverySourceReader, {
          exists: () => Effect.succeed(true),
          read: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Effect.sync(() => {
                  cleaned = true;
                }),
              ),
            ),
        }),
        Effect.forkScoped,
      );
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
      expect(cleaned).toBe(true);
      expect(passes).toEqual([1]);
    }),
  );
});
