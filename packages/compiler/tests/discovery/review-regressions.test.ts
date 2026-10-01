import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { scanSourceEffect } from "../../src/discovery/ast-prefilter-utils.js";
import { mapSourceLocationsEffect } from "../../src/discovery/source-map.js";
import { DiscoverySourceReader } from "../../src/discovery/source-map-source.js";
import { resolveImportEffect } from "../../src/discovery/source-map-utils.js";
import { moduleSnapshot } from "./source-mapping-fixtures.js";

const root = "/tmp/compiler-discovery-review";
const absentReader = DiscoverySourceReader.of({
  exists: () => Effect.succeed(false),
  read: () => Effect.die("supplemental sources should not require native reads"),
});

describe("discovery review regressions", () => {
  it.effect("retains a default value import alongside exclusively type-only named imports", () =>
    Effect.gen(function* () {
      const value = yield* scanSourceEffect(
        "src/example.ts",
        'import factory, { type Options } from "@relkit/function";',
      );
      expect(value.imports).toEqual(["@relkit/function"]);
      const types = yield* scanSourceEffect(
        "src/types.ts",
        'import { type Options } from "@relkit/function";',
      );
      expect(types.imports).toEqual([]);
    }),
  );

  it.effect("searches later star re-exports when the first branch has no matching binding", () =>
    Effect.gen(function* () {
      const result = yield* mapSourceLocationsEffect(
        [moduleSnapshot("src/barrel.ts", ["target"])],
        {
          projectRoot: root,
          sources: [
            {
              fileName: "src/barrel.ts",
              text: 'export * from "./first.ts";\nexport * from "./second.ts";',
            },
            { fileName: "src/first.ts", text: "export const unrelated = 1;" },
            { fileName: "src/second.ts", text: "\nexport const target = defineFunction({});" },
          ],
        },
      );
      expect(result[0]?.source).toMatchObject({ file: "src/second.ts", line: 2 });
      expect(result[0]?.exportFact?.binding).toBe("target");
    }).pipe(Effect.provideService(DiscoverySourceReader, absentReader)),
  );

  it.effect("maps runtime JavaScript extensions back to authored TypeScript sources", () =>
    Effect.gen(function* () {
      const texts = new Map([
        ["src/value.ts", ""],
        ["src/view.tsx", ""],
        ["src/esm.mts", ""],
        ["src/common.cts", ""],
      ]);
      for (const [runtime, source] of [
        ["value.js", "value.ts"],
        ["view.jsx", "view.tsx"],
        ["esm.mjs", "esm.mts"],
        ["common.cjs", "common.cts"],
      ]) {
        expect(yield* resolveImportEffect("src/barrel.ts", `./${runtime}`, root, texts)).toBe(
          `src/${source}`,
        );
      }
      texts.set("src/value.js", "");
      expect(yield* resolveImportEffect("src/barrel.ts", "./value.js", root, texts)).toBe(
        "src/value.js",
      );
    }).pipe(Effect.provideService(DiscoverySourceReader, absentReader)),
  );
});
