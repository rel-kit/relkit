/** Verifies the production lifecycle export and its declared runtime package closure. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Schema } from "effect";
import { expect, test } from "vitest";

const Manifest = Schema.Struct({
  name: Schema.String,
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  exports: Schema.optionalKey(Schema.Json),
});
const repository = resolve(import.meta.dirname, "../../../..");

test("production lifecycle is exported by the runtime owner", () => {
  const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(
    readFileSync(resolve(repository, "packages/engine/package.json"), "utf8"),
  );
  expect(manifest.exports).toMatchObject({
    "./internal/server-runtime": {
      import: "./dist/internal/server-runtime.js",
    },
  });
});

test("production framework closure has no development CLI or native local store edge", () => {
  const manifests = new Map<string, Schema.Schema.Type<typeof Manifest>>();
  for (const directory of readdirSync(resolve(repository, "packages"))) {
    const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(
      readFileSync(resolve(repository, "packages", directory, "package.json"), "utf8"),
    );
    manifests.set(manifest.name, manifest);
  }
  const reached = new Set<string>();
  const pending = ["@relkit/engine"];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (reached.has(name)) continue;
    reached.add(name);
    pending.push(...Object.keys(manifests.get(name)?.dependencies ?? {}));
  }
  for (const name of [
    "@relkit/cli",
    "@relkit/compiler",
    "@relkit/observability-local",
    "@relkit/inspector-api",
    "@relkit/deploy-pulumi",
    "@relkit/deploy",
    "@relkit/pulumi",
    "@pulumi/pulumi",
    "@duckdb/node-api",
  ])
    expect(reached.has(name)).toBe(false);
});
