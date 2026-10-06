import { expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Logger } from "effect";
import { normalizeAddRequest } from "../src/add-options.js";
import { discoverProjectEffect, projectDiscoveryLive } from "../src/project-discovery.js";
import { PlanBuilder } from "../src/plan-builder.js";
import { publicFailure } from "../src/generator-errors.js";
import { GeneratorPaths } from "../src/generator-paths.js";
import { canonicalizeMissingPathEffect } from "../src/validate-paths.js";
import { memoryFileSystem } from "./generator-services.fixture.js";

const root = "/memory/app";
const files = {
  [root + "/package.json"]: '{"dependencies":{"@relkit/app":"0.4.0"}}',
  [root + "/relkit.config.ts"]:
    'import { defineApp } from "@relkit/app/config"; export default defineApp({});',
  [root + "/src/hello/service.ts"]:
    'import { defineService } from "@relkit/app/services"; export default defineService({});',
  [root + "/value.ts"]: "original",
};

it.effect("preserves complete missing segments beneath the filesystem root", () =>
  Effect.gen(function* () {
    const paths = Layer.succeed(
      GeneratorPaths,
      GeneratorPaths.of({
        metadata: (path) =>
          Effect.succeed(path === "/" ? { kind: "directory" as const, mode: 0o755 } : undefined),
        entries: () => Effect.succeed([]),
        realpath: (path) => Effect.succeed(path),
        cwd: () => Effect.succeed("/"),
        home: () => Effect.succeed("/home"),
        temporaryRoot: () => Effect.succeed("/tmp"),
      }),
    );
    for (const destination of ["/missing", "/missing/nested"])
      expect(
        yield* canonicalizeMissingPathEffect(destination).pipe(
          Effect.provide(paths),
          Effect.provide(Logger.layer([])),
        ),
      ).toBe(destination);
  }),
);

it.effect("uses the same discovery contract with an isolated test filesystem Layer", () =>
  Effect.gen(function* () {
    const fixture = yield* memoryFileSystem(files);
    const discovery = yield* discoverProjectEffect(root).pipe(
      Effect.provide(projectDiscoveryLive),
      Effect.provide(fixture.layer),
      Effect.provide(Logger.layer([])),
    );
    expect(discovery.services.map((service) => service.domain)).toContain("hello");
    expect((yield* fixture.snapshot).size).toBe(Object.keys(files).length);
  }),
);

it.effect("isolates request state and atomically reserves duplicate file creation", () =>
  Effect.gen(function* () {
    const fixture = yield* memoryFileSystem(files);
    yield* Effect.gen(function* () {
      const discovery = yield* discoverProjectEffect(root).pipe(
        Effect.provide(projectDiscoveryLive),
      );
      const request = normalizeAddRequest(["function", "Sample", "--project-root", root]);
      const first = new PlanBuilder(request, discovery);
      const second = new PlanBuilder(request, discovery);
      const exits = yield* Effect.all(
        [
          Effect.exit(first.createEffect("new.ts", "one")),
          Effect.exit(first.createEffect("new.ts", "two")),
        ],
        { concurrency: "unbounded" },
      );
      expect(exits.filter(Exit.isSuccess)).toHaveLength(1);
      const failure = exits.find(Exit.isFailure);
      expect(failure).toBeDefined();
      expect(yield* first.readEffect("new.ts")).toMatch(/one|two/);
      expect(Exit.isFailure(yield* Effect.exit(second.readEffect("new.ts")))).toBe(true);
      yield* Effect.all(
        [
          first.updateEffect("value.ts", (source) => source + ":first"),
          first.updateEffect("value.ts", (source) => source + ":second"),
        ],
        { concurrency: "unbounded" },
      );
      expect(yield* first.readEffect("value.ts")).toMatch(/^original:(first:second|second:first)$/);
      expect(yield* second.readEffect("value.ts")).toBe("original");
      yield* first.registerArtifactEffect("function", {
        domain: "hello",
        path: "new.ts",
        binding: "sample",
        id: "hello.sample",
        ...{ kind: "event" },
      });
      expect(first.artifacts.at(-1)?.kind).toBe("function");
      expect(second.artifacts).toHaveLength(discovery.artifacts.length);
    }).pipe(Effect.provide(fixture.layer), Effect.provide(Logger.layer([])));
  }),
);

it.effect("keeps unexpected source-transform exceptions as defects", () =>
  Effect.gen(function* () {
    const fixture = yield* memoryFileSystem(files);
    const discovery = yield* discoverProjectEffect(root).pipe(
      Effect.provide(projectDiscoveryLive),
      Effect.provide(fixture.layer),
      Effect.provide(Logger.layer([])),
    );
    const builder = new PlanBuilder(
      normalizeAddRequest(["function", "Sample", "--project-root", root]),
      discovery,
    );
    const defect = new Error("Unexpected transform bug.");
    const exit = yield* Effect.exit(
      builder.updateEffect("value.ts", () => {
        throw defect;
      }),
    ).pipe(Effect.provide(fixture.layer), Effect.provide(Logger.layer([])));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(
        exit.cause.reasons.some(
          (reason) => reason._tag === "Die" && publicFailure(reason.defect) === defect,
        ),
      ).toBe(true);
  }),
);
