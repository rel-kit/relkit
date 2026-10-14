/**
 * Exercises real Bun-hosted declaration discovery without evaluating source text.
 * Assertions cover helper-only inputs, portable containment and every unsupported
 * boundary shape; failures remain visible through the native probe runtime.
 */
import assert from "node:assert/strict";
import { Effect } from "effect";
import { discoverApplicationLayoutEffect } from "../src/discovery/application-layout.js";
import { runLayoutProbe } from "./layout-probe-runner.js";

const service =
  'import { defineService } from "@relkit/app/services"; export default defineService({});';
const fn =
  'import { defineFunction } from "@relkit/app/functions"; export default defineFunction({});';

/** Verifies helper files do not register services or select a layout.
 * @returns Lazy assertions using compiler syntax facts and no live resources.
 */
const helperAcceptance = Effect.fn("LayoutProbe.helpers")(function* () {
  const empty = yield* discoverApplicationLayoutEffect(
    [{ fileName: "src/helpers/value.ts", text: "export const value = 1;" }],
    "/app",
  );
  assert.equal(empty.kind, "grouped");
  assert.deepEqual(empty.services, []);
  const flat = yield* discoverApplicationLayoutEffect(
    [
      { fileName: "src/orders/service.ts", text: service },
      { fileName: "src/services/helpers/value.ts", text: "export const value = 1;" },
    ],
    "/app",
  );
  assert.equal(flat.kind, "flat");
  assert.deepEqual(
    flat.services.map((item) => item.name),
    ["orders"],
  );
});

/** Verifies equivalent spellings normalize before ownership and escapes fail.
 * @returns Lazy physical-path assertions retaining typed SourceLocationError.
 */
const pathAcceptance = Effect.fn("LayoutProbe.paths")(function* () {
  for (const fileName of [
    "src/services/orders/get.function.ts",
    "./src/services/orders/get.function.ts/",
    "src\\services\\orders\\get.function.ts",
    "/app/src/services/orders/get.function.ts",
  ]) {
    const layout = yield* discoverApplicationLayoutEffect([{ fileName, text: fn }], "/app");
    assert.equal(layout.services[0]?.root, "src/services/orders");
  }
  const failure = yield* Effect.flip(
    discoverApplicationLayoutEffect([{ fileName: "../outside.ts", text: fn }], "/app"),
  );
  assert.equal(failure._tag, "SourceLocationError");
});

/** Verifies mixed/aggregate/nested/removed-root findings retain their physical origins.
 * @returns Lazy structural assertions with no candidate code evaluation.
 */
const boundaryAcceptance = Effect.fn("LayoutProbe.boundaries")(function* () {
  const layout = yield* discoverApplicationLayoutEffect(
    [
      { fileName: "src/services/service.ts", text: service },
      { fileName: "src/services/orders/nested/service.ts", text: service },
      { fileName: "src/orders/service.ts", text: service },
      { fileName: "src/functions/service.ts", text: service },
    ],
    "/app",
  );
  const messages = layout.issues.map((issue) => issue.message).join("\n");
  for (const expected of [
    "grouping container",
    "nested",
    "Mixed service layouts",
    "Legacy layer-first root",
  ])
    assert.ok(messages.includes(expected));
});

if (import.meta.main)
  await runLayoutProbe(
    Effect.gen(function* () {
      yield* helperAcceptance();
      yield* pathAcceptance();
      yield* boundaryAcceptance();
    }),
  );
