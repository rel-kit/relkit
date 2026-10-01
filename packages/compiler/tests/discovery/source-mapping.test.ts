import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { moduleSnapshot } from "./source-mapping-fixtures.js";
import { extractDescriptorsEffect } from "../../src/discovery/extract.js";
import {
  DiscoverySourceReader,
  nodeSourceReader,
  SourceMapReadError,
} from "../../src/discovery/source-map-source.js";
import { mapSourceLocationsEffect } from "../../src/discovery/source-map.js";
import { resolveImportEffect } from "../../src/discovery/source-map-utils.js";

const root = "/tmp/relkit-source-mapping";

describe("discovery source capability", () => {
  it.effect("preserves defects while reading supplied source text properties", () =>
    Effect.gen(function* () {
      const defect = new TypeError("source getter bug");
      const result = yield* Effect.exit(
        mapSourceLocationsEffect([], {
          projectRoot: root,
          sources: [
            {
              fileName: "src/broken.ts",
              get text(): string {
                throw defect;
              },
            },
          ],
        }),
      );
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result))
        expect(result.cause.reasons).toMatchObject([{ _tag: "Die", defect }]);
    }).pipe(Effect.provideService(DiscoverySourceReader, nodeSourceReader)),
  );

  it.effect("uses supplemental re-export text without touching the filesystem", () =>
    Effect.gen(function* () {
      const result = yield* mapSourceLocationsEffect(
        [moduleSnapshot("src/barrel.ts", ["renamed"])],
        {
          projectRoot: root,
          sources: [
            {
              fileName: "src/barrel.ts",
              text: 'export { original as renamed } from "./origin.ts";',
            },
            { fileName: "src/origin.ts", text: "\nexport const original = defineFunction({});" },
          ],
        },
      );
      expect(result[0]?.source).toMatchObject({ file: "src/origin.ts", line: 2 });
      expect(result[0]?.exportFact?.binding).toBe("original");
      expect(Object.isFrozen(result)).toBe(true);
    }).pipe(
      Effect.provideService(DiscoverySourceReader, {
        exists: () => Effect.die("unexpected existence check"),
        read: () => Effect.die("unexpected file read"),
      }),
    ),
  );

  it.effect("parses a shared source once and sorts entries while keeping caches run-local", () => {
    let reads = 0;
    const reader = DiscoverySourceReader.of({
      exists: () => Effect.succeed(true),
      read: () =>
        Effect.sync(() => {
          reads += 1;
          return "export const zebra = 1;\nexport const alpha = 2;";
        }),
    });
    const modules = [moduleSnapshot("src/values.ts", ["zebra", "alpha"])];
    return Effect.gen(function* () {
      const result = yield* mapSourceLocationsEffect(modules, { projectRoot: root });
      expect(reads).toBe(1);
      expect(result.map((entry) => entry.exportName)).toEqual(["alpha", "zebra"]);
      yield* mapSourceLocationsEffect(modules, { projectRoot: root });
      expect(reads).toBe(2);
    }).pipe(Effect.provideService(DiscoverySourceReader, reader));
  });

  it.effect("memoizes missing sources and retains the line-one fallback", () => {
    let checks = 0;
    return Effect.gen(function* () {
      const result = yield* mapSourceLocationsEffect(
        [moduleSnapshot("src/missing.ts", ["b", "a"])],
        {
          projectRoot: root,
        },
      );
      expect(checks).toBe(1);
      expect(result.map((entry) => entry.source)).toEqual([
        { file: "src/missing.ts", line: 1, column: 1 },
        { file: "src/missing.ts", line: 1, column: 1 },
      ]);
    }).pipe(
      Effect.provideService(DiscoverySourceReader, {
        exists: () =>
          Effect.sync(() => {
            checks += 1;
            return false;
          }),
        read: () => Effect.die("missing sources must not be read"),
      }),
    );
  });

  it.effect("recovers typed source read failures at the mapping boundary", () =>
    Effect.gen(function* () {
      const result = yield* mapSourceLocationsEffect([moduleSnapshot("src/denied.ts", ["entry"])], {
        projectRoot: root,
      });
      expect(result[0]?.source).toEqual({ file: "src/denied.ts", line: 1, column: 1 });
      expect(result[0]?.facts).toBeUndefined();
    }).pipe(
      Effect.provideService(DiscoverySourceReader, {
        exists: () => Effect.succeed(true),
        read: (path) =>
          Effect.fail(new SourceMapReadError({ path, cause: new Error("permission denied") })),
      }),
    ),
  );

  it.effect("preserves source-reader defects instead of returning fallback locations", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        mapSourceLocationsEffect([moduleSnapshot("src/broken.ts", ["entry"])], {
          projectRoot: root,
        }),
      );
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result))
        expect(result.cause.reasons).toMatchObject([{ _tag: "Die", defect: "reader bug" }]);
    }).pipe(
      Effect.provideService(DiscoverySourceReader, {
        exists: () => Effect.succeed(true),
        read: () => Effect.die("reader bug"),
      }),
    ),
  );

  it.effect("preserves interruption during a pending source lookup", () =>
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      const reader = DiscoverySourceReader.of({
        exists: () => Effect.succeed(true),
        read: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(ready, undefined);
            return yield* Effect.never;
          }),
      });
      const fiber = yield* mapSourceLocationsEffect([moduleSnapshot("src/pending.ts", ["entry"])], {
        projectRoot: root,
      }).pipe(Effect.provideService(DiscoverySourceReader, reader), Effect.forkScoped);
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(fiber);
      const result = yield* Fiber.await(fiber);
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result))
        expect(result.cause.reasons.some((reason) => reason._tag === "Interrupt")).toBe(true);
    }),
  );

  it.effect("terminates cyclic re-export resolution with the original fallback", () =>
    Effect.gen(function* () {
      const result = yield* mapSourceLocationsEffect([moduleSnapshot("src/a.ts", ["entry"])], {
        projectRoot: root,
        sources: [
          { fileName: "src/a.ts", text: 'export { entry } from "./b.ts";' },
          { fileName: "src/b.ts", text: 'export { entry } from "./a.ts";' },
        ],
      });
      expect(result[0]?.source).toEqual({ file: "src/a.ts", line: 1, column: 1 });
      expect(result[0]?.facts).toBeUndefined();
    }).pipe(
      Effect.provideService(DiscoverySourceReader, {
        exists: () => Effect.die("supplied paths must bypass existence checks"),
        read: () => Effect.die("supplied sources must bypass reads"),
      }),
    ),
  );

  it.effect("retains import candidate precedence and rejects outside-root paths", () =>
    Effect.gen(function* () {
      const texts = new Map([
        ["src/item.ts", ""],
        ["src/item.tsx", ""],
      ]);
      expect(yield* resolveImportEffect("src/barrel.ts", "./item", root, texts)).toBe(
        "src/item.ts",
      );
      expect(
        yield* resolveImportEffect("src/barrel.ts", "../../outside", root, texts),
      ).toBeUndefined();
      expect(
        yield* resolveImportEffect("src/barrel.ts", "@relkit/functions", root, texts),
      ).toBeUndefined();
    }).pipe(
      Effect.provideService(DiscoverySourceReader, {
        exists: () => Effect.succeed(false),
        read: () => Effect.die("import resolution should not read text"),
      }),
    ),
  );

  it.effect("composes extraction with mapping and preserves existing executable references", () =>
    Effect.gen(function* () {
      const result = yield* extractDescriptorsEffect([moduleSnapshot("src/entry.ts", ["entry"])], {
        projectRoot: root,
        generationId: "replacement",
        sources: [{ fileName: "src/entry.ts", text: "export const entry = defineFunction({});" }],
      });
      expect(result[0]?.reference.generationId).toBe("original");
      expect(result[0]?.exportFact?.binding).toBe("entry");
      expect(Object.isFrozen(result[0])).toBe(true);
    }).pipe(Effect.provideService(DiscoverySourceReader, nodeSourceReader)),
  );

  it.effect("classifies native errno read failures with their source path", () =>
    Effect.gen(function* () {
      const path = `${root}/absent-${crypto.randomUUID()}.ts`;
      const failure = yield* Effect.flip(nodeSourceReader.read(path));
      expect(failure._tag).toBe("SourceMapReadError");
      expect(failure.path).toBe(path);
      expect(failure.cause).toMatchObject({ code: "ENOENT" });
    }),
  );
});
