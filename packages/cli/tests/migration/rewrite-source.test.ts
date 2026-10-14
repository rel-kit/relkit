/** Verifies asset URL migration against actual source syntax and TypeScript resolution. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { sourceResolutionLayer } from "@relkit/compiler";
import { rewriteLayoutSource } from "../../src/migration/layout-rewrite-source.js";

const moves = [{ from: "src/hello", to: "src/services/hello" }];

/** Rewrites unevaluated authored source with the real resolver and no runtime resources.
 * @param file - Original importer path.
 * @param text - Complete source under test.
 * @returns Literal edits and manual-action conflicts. */
function rewrite(file: string, text: string) {
  return rewriteLayoutSource(file, text, moves).pipe(
    Effect.provide(
      sourceResolutionLayer({ root: "/layout-url-test", sources: new Map([[file, text]]) }),
    ),
  );
}

it.live("rebases relative asset URLs while preserving encoding and URL suffixes", () =>
  Effect.gen(function* () {
    const result = yield* rewrite(
      "src/hello/functions/hello.function.ts",
      'const asset = new URL("../../platform/message%20one.txt?version=1#part", import.meta.url);',
    );
    expect(result.conflicts).toEqual([]);
    expect(result.text).toBe(
      'const asset = new URL("../../../platform/message%20one.txt?version=1#part", import.meta.url);',
    );
  }),
);

it.live("updates a stationary importer referencing a moved asset", () =>
  Effect.gen(function* () {
    const result = yield* rewrite(
      "src/routes/route.ts",
      'const asset = new URL("../hello/assets/message.txt", import.meta.url);',
    );
    expect(result.conflicts).toEqual([]);
    expect(result.text).toBe(
      'const asset = new URL("../services/hello/assets/message.txt", import.meta.url);',
    );
  }),
);

it.live("preserves co-moved assets, external URLs, unrelated bases and payloads", () =>
  Effect.gen(function* () {
    const text = [
      'const local = new URL("../assets/message.txt", import.meta.url);',
      'const remote = new URL("https://example.com/src/hello/message.txt", import.meta.url);',
      'const absolute = new URL("/tmp/message.txt", import.meta.url);',
      'const otherBase = new URL("../platform/message.txt", base);',
      'const payload = "../../platform/message.txt";',
    ].join("\n");
    expect(yield* rewrite("src/hello/functions/hello.function.ts", text)).toEqual({
      text,
      conflicts: [],
    });
  }),
);

it.live("refuses a computed asset URL rather than publishing an unresolved move", () =>
  Effect.gen(function* () {
    const text = "const asset = new URL(assetPath, import.meta.url);";
    const result = yield* rewrite("src/hello/functions/hello.function.ts", text);
    expect(result.text).toBe(text);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.message).toContain("manual");
  }),
);
