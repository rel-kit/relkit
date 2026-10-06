import { expect, it } from "@effect/vitest";
import { defineEnv, env, projectEnv } from "@relkit/config";
import { GRAPH_VERSION } from "@relkit/contracts";
import { createLoggerLayer, type RedactedLogRecord } from "@relkit/runtime-effect";
import { Cause, Effect, Exit, Layer, Logger, Metric } from "effect";
import { cliAdapterError, cliOriginalError } from "../../src/cli-errors.js";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { graphFilesLive, CliGraphFiles } from "../../src/commands/graph-file.service.js";
import {
  environmentProjectLive,
  CliEnvironmentProject,
} from "../../src/commands/env-project.service.js";
import { resolveStatus, resolveStatusEffect } from "../../src/commands/env-support.js";
import { GraphCommandError } from "../../src/commands/graph-error.js";
import { EnvCommandError } from "../../src/commands/env-format.js";
import { testFiles } from "./test-files.js";

const emptyGraph = JSON.stringify({ contractVersion: GRAPH_VERSION, nodes: [], edges: [] });

it.effect("graph validation and comparisons use only injected read authority", () =>
  Effect.gen(function* () {
    const reads: string[] = [];
    const files = testFiles({
      readText: (path) =>
        Effect.sync(() => {
          reads.push(path);
          return emptyGraph;
        }),
    });
    const result = yield* CliGraphFiles.use((graphs) =>
      graphs.diff("before.json", "after.json", { projectRoot: "/fixture" }),
    ).pipe(
      Effect.provide(graphFilesLive),
      Effect.provideService(CliFileSystem, files),
      Effect.provide(Logger.layer([])),
    );
    expect(reads).toEqual(["/fixture/before.json", "/fixture/after.json"]);
    expect(result.changes).toEqual([]);
    expect(result.beforeHash).toBe(result.afterHash);
  }),
);

it.effect("graph failures retain constructor, code, and version guidance", () =>
  Effect.gen(function* () {
    const cases = [
      { text: "[", code: "RELKIT_GRAPH_INVALID" },
      { text: "[]", code: "RELKIT_GRAPH_INVALID" },
      {
        text: JSON.stringify({ contractVersion: GRAPH_VERSION - 1 }),
        code: "RELKIT_GRAPH_VERSION_UNSUPPORTED",
      },
      {
        text: JSON.stringify({ contractVersion: GRAPH_VERSION, nodes: "invalid", edges: [] }),
        code: "RELKIT_GRAPH_INVALID",
      },
    ];
    for (const item of cases) {
      const exit = yield* Effect.exit(
        CliGraphFiles.use((graphs) => graphs.read({ projectRoot: "/fixture" })).pipe(
          Effect.provide(graphFilesLive),
          Effect.provideService(
            CliFileSystem,
            testFiles({ readText: () => Effect.succeed(item.text) }),
          ),
          Effect.provide(Logger.layer([])),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const failure = cliOriginalError(Cause.squash(exit.cause));
        expect(failure).toBeInstanceOf(GraphCommandError);
        expect(failure).toMatchObject({ code: item.code });
        if (item.code === "RELKIT_GRAPH_VERSION_UNSUPPORTED")
          expect(String(failure)).toContain("Regenerate with `relkit check`");
      }
    }
    const missing = Object.assign(new Error("private filesystem detail"), { code: "ENOENT" });
    const exit = yield* Effect.exit(
      CliGraphFiles.use((graphs) => graphs.read({ projectRoot: "/fixture" })).pipe(
        Effect.provide(graphFilesLive),
        Effect.provideService(
          CliFileSystem,
          testFiles({ readText: () => Effect.fail(cliAdapterError("fixture.read", missing)) }),
        ),
        Effect.provide(Logger.layer([])),
      ),
    );
    if (Exit.isFailure(exit))
      expect(cliOriginalError(Cause.squash(exit.cause))).toMatchObject({
        code: "RELKIT_GRAPH_NOT_FOUND",
        message: "Graph file was not found: /fixture/.relkit/generated/application.graph.json",
      });
    else throw new Error("Expected missing artifact failure");
  }),
);

it.effect(
  "environment imports retain opaque identity and reject escaping paths before import",
  () =>
    Effect.gen(function* () {
      const definition = defineEnv({ TOKEN: env.secret().default("synthetic-secret") });
      let imports = 0;
      const modules = {
        load: () =>
          Effect.sync(() => {
            imports++;
            return { default: definition };
          }),
        invalidate: () => Effect.void,
      };
      const layer = environmentProjectLive.pipe(
        Layer.provide(
          Layer.merge(
            Layer.succeed(CliFileSystem, testFiles()),
            Layer.succeed(CliModules, modules),
          ),
        ),
      );
      const loaded = yield* CliEnvironmentProject.use((project) =>
        project.load({ projectRoot: "/fixture" }),
      ).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])));
      expect(loaded).toBe(definition);
      const exit = yield* Effect.exit(
        CliEnvironmentProject.use((project) =>
          project.load({ projectRoot: "/fixture", envPath: "../outside.ts" }),
        ).pipe(Effect.provide(layer), Effect.provide(Logger.layer([]))),
      );
      expect(imports).toBe(1);
      if (Exit.isFailure(exit))
        expect(cliOriginalError(Cause.squash(exit.cause))).toBeInstanceOf(EnvCommandError);
      else throw new Error("Expected contained-path rejection");
    }),
);

it.effect("example preview keeps user bytes and writes only redacted explicit content", () =>
  Effect.gen(function* () {
    const definition = defineEnv({
      TOKEN: env.secret().default("synthetic-secret"),
      SERVICE_PORT: env.port().example(3210),
    });
    const writes: Array<readonly [string, string]> = [];
    const files = testFiles({
      readText: () => Effect.succeed("USER=edited\n"),
      writeText: (path, text) =>
        Effect.sync(() => {
          writes.push([path, text]);
        }),
    });
    const layer = environmentProjectLive.pipe(
      Layer.provide(
        Layer.merge(
          Layer.succeed(CliFileSystem, files),
          Layer.succeed(CliModules, {
            load: () => Effect.die("Unexpected import"),
            invalidate: () => Effect.void,
          }),
        ),
      ),
    );
    const fields = projectEnv(definition);
    const preview = yield* CliEnvironmentProject.use((project) =>
      project.example(fields, { projectRoot: "/fixture" }, false),
    ).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])));
    expect(preview.existing).toBe(true);
    expect(writes).toEqual([]);
    const written = yield* CliEnvironmentProject.use((project) =>
      project.example(fields, { projectRoot: "/fixture" }, true),
    ).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])));
    expect(writes).toEqual([["/fixture/.env.example", "SERVICE_PORT=3210\nTOKEN=[redacted]\n"]]);
    expect(JSON.stringify(written)).not.toContain("synthetic-secret");
  }),
);

it.effect("Effect environment statuses preserve synchronous safe projections", () =>
  Effect.gen(function* () {
    const definition = defineEnv({
      TOKEN: env.secret().requiredIn("production"),
      SERVICE_PORT: env.port().default(3000),
    });
    const fields = projectEnv(definition);
    const source = { TOKEN: "synthetic-secret", SERVICE_PORT: "invalid" };
    const expected = resolveStatus(definition, fields, "production", source);
    const actual = yield* resolveStatusEffect(definition, fields, "production", source).pipe(
      Effect.provide(Logger.layer([])),
    );
    expect(actual).toEqual(expected);
    expect(JSON.stringify(actual)).not.toContain("synthetic-secret");
    expect(actual.issues).toEqual([
      { name: "SERVICE_PORT", code: "invalid", sensitive: false, message: "Value is invalid" },
    ]);
  }),
);

it.effect("standalone methods observe once with safe fixed labels and caller logger", () =>
  Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    const records: RedactedLogRecord[] = [];
    const definition = defineEnv({ TOKEN: env.secret().default("synthetic-secret") });
    const layer = Layer.merge(graphFilesLive, environmentProjectLive).pipe(
      Layer.provide(
        Layer.merge(
          Layer.succeed(CliFileSystem, testFiles({ readText: () => Effect.succeed(emptyGraph) })),
          Layer.succeed(CliModules, {
            load: () => Effect.succeed({ default: definition }),
            invalidate: () => Effect.void,
          }),
        ),
      ),
    );
    yield* Effect.gen(function* () {
      yield* CliGraphFiles.use((graphs) => graphs.check({ projectRoot: "/synthetic-secret" }));
      yield* CliEnvironmentProject.use((project) =>
        project.load({ projectRoot: "/synthetic-secret" }),
      );
    }).pipe(
      Effect.provide(layer),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provide(
        createLoggerLayer({
          human: false,
          json: {
            write: (record) => {
              records.push(record);
            },
          },
        }),
      ),
    );
    const counts = [...registry.values()].filter(
      (entry) => entry.id === "relkit_execution_operations_total",
    );
    expect(counts.map((entry) => entry.attributes?.operation).sort()).toEqual([
      "env.load",
      "graph.check",
      "graph.read",
    ]);
    const context = yield* Effect.context();
    expect(counts.every((entry) => entry.hooks.get(context).count === 1)).toBe(true);
    expect(records).toHaveLength(3);
    expect(records.every((record) => record.level === "info")).toBe(true);
    expect(JSON.stringify(records)).not.toContain("synthetic-secret");
  }),
);
