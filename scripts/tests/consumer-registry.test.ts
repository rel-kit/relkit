/**
 * Verifies compressed-byte measurement at the actual packed-registry boundary.
 * The fixture serves known candidate bytes and never contacts a public registry;
 * every listener and temporary artifact belongs to this test's scope.
 */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { consumerRegistry } from "../consumer-registry.js";

const Packument = Schema.fromJsonString(
  Schema.Struct({
    versions: Schema.Record(
      Schema.String,
      Schema.Struct({
        dist: Schema.Struct({ tarball: Schema.String }),
      }),
    ),
  }),
);

test("measures the real compressed candidate once despite repeated downloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-consumer-registry-"));
  try {
    const manifest = { name: "@relkit/fixture", version: "1.0.0" };
    const file = join(root, "fixture.tgz");
    const bytes = await new Bun.Archive(
      { "package/package.json": JSON.stringify(manifest) },
      { compress: "gzip" },
    ).bytes();
    await Bun.write(file, bytes);
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const registry = yield* consumerRegistry(
            root,
            new Map([[manifest.name, file]]),
            new Map([[manifest.name, { directory: root, manifest }]]),
          );
          const metadata = yield* Effect.promise(() =>
            fetch(registry.url + "/" + encodeURIComponent(manifest.name)),
          );
          const text = yield* Effect.promise(() => metadata.text());
          const packument = yield* Schema.decodeUnknownEffect(Packument)(text);
          const url = packument.versions["1.0.0"]?.dist.tarball;
          expect(url).toBeDefined();
          if (url === undefined) throw new Error("Fixture tarball URL is absent");
          expect(new URL(url).origin).toBe(registry.url);
          const first = yield* Effect.promise(() => fetch(url));
          expect(new Uint8Array(yield* Effect.promise(() => first.arrayBuffer()))).toEqual(bytes);
          const second = yield* Effect.promise(() => fetch(url));
          yield* Effect.promise(() => second.arrayBuffer());
          expect([...registry.archives.values()]).toEqual([
            { name: "@relkit/fixture", version: "1.0.0", bytes: bytes.byteLength },
          ]);
          expect(registry.transferredBytes()).toBe(bytes.byteLength * 2);
        }),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
