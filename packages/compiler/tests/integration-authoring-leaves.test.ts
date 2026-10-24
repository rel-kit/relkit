/** Exact owning metadata admits selected model/auth authoring leaves while rejecting private, runtime, frontend and malformed selections. */
import { readFileSync } from "node:fs";
import { Effect, Schema } from "effect";
import { expect, test } from "vitest";
import { assertAuthoringImportEffect } from "../src/integration-package-metadata.js";

/** Reads the actual maintained package manifest without evaluating its optional SDK. */
function manifest(name: "drizzle" | "better-auth") {
  return Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)))(
    readFileSync(new URL(`../../${name}/package.json`, import.meta.url), "utf8"),
  );
}

test.each([
  ["drizzle", ""],
  ["drizzle", "/sqlite"],
  ["drizzle", "/pg"],
  ["drizzle", "/mysql"],
  ["better-auth", ""],
  ["better-auth", "/drizzle"],
] as const)("%s%s is an exact owning authoring selection", async (name, leaf) => {
  await expect(
    Effect.runPromise(assertAuthoringImportEffect(manifest(name), `@relkit/${name}${leaf}`)),
  ).resolves.toBeUndefined();
});

test.each([
  ["drizzle", "/internal"],
  ["drizzle", "/sqlite/private"],
  ["drizzle", "/runtime"],
  ["better-auth", "/react"],
  ["better-auth", "/drizzle/private"],
] as const)("%s%s remains outside authoring authority", async (name, leaf) => {
  const failure = await Effect.runPromise(
    Effect.flip(assertAuthoringImportEffect(manifest(name), `@relkit/${name}${leaf}`)),
  );
  expect(failure._tag).toBe("IntegrationPackageValidationError");
});

test.each([
  { name: "empty", authoring: [] },
  { name: "missing leaf", authoring: ["./missing"] },
  { name: "wildcard", authoring: ["./*"] },
  { name: "traversal", authoring: ["./../runtime"] },
  { name: "nonstring", authoring: [7] },
])("malformed authoring list $name fails closed", async ({ authoring }) => {
  const source = {
    name: "fixture",
    exports: { ".": {} },
    relkit: { integration: { exports: { authoring } } },
  };
  const failure = await Effect.runPromise(
    Effect.flip(assertAuthoringImportEffect(source, "fixture")),
  );
  expect(failure._tag).toBe("IntegrationPackageValidationError");
});

test("legacy single exact root remains supported", async () => {
  const source = {
    name: "fixture",
    exports: { ".": {} },
    relkit: { integration: { exports: { authoring: "." } } },
  };
  await expect(
    Effect.runPromise(assertAuthoringImportEffect(source, "fixture")),
  ).resolves.toBeUndefined();
});
