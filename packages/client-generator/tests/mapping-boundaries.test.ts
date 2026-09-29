import { expect, test } from "vitest";
import { Effect } from "effect";
import { collectMappingsEffect, responseContractsEffect } from "../src/generate-mappings.js";

test("unwraps nested, transformed, optional, and defaulted mappings", () => {
  const leaves = Effect.runSync(
    collectMappingsEffect({
      kind: "nested",
      fields: {
        upload: {
          kind: "transform",
          value: { kind: "optional", value: { kind: "multipart-all" } },
        },
        value: {
          kind: "default",
          value: { kind: "body" },
        },
        flag: { kind: "constant", value: false },
        ignored: { kind: 1 },
      },
    }),
  );
  expect(leaves).toEqual([
    {
      inputPath: ["flag"],
      outputPath: ["flag"],
      kind: "constant",
      value: false,
      optional: false,
      defaulted: false,
    },
    {
      inputPath: ["upload"],
      outputPath: ["upload"],
      kind: "multipart-all",
      optional: true,
      defaulted: false,
    },
    {
      inputPath: ["value"],
      outputPath: ["value"],
      kind: "body",
      optional: false,
      defaulted: true,
    },
  ]);
  expect(Effect.runSync(collectMappingsEffect(null))).toEqual([]);
  expect(Effect.runSync(collectMappingsEffect({ kind: "body" }))).toEqual([
    {
      inputPath: [],
      outputPath: ["value"],
      kind: "body",
      optional: false,
      defaulted: false,
    },
  ]);
});

test("normalizes malformed responses and preserves explicit validation metadata", () => {
  const responses = Effect.runSync(
    responseContractsEffect([
      null,
      { id: 12, kind: 13, status: "bad", schema: null },
      {
        id: "validation.custom",
        kind: "validation-error",
        status: 400,
        errorId: "invalid",
        schema: { type: "object" },
      },
    ]),
  );
  expect(responses).toEqual([
    { id: "response", kind: "response", status: 0 },
    {
      id: "validation.custom",
      kind: "validation-error",
      status: 400,
      errorId: "invalid",
      schema: { type: "object" },
    },
  ]);
  expect(
    Effect.runSync(
      responseContractsEffect([
        { id: "later", kind: "success", status: 200 },
        { id: "earlier", kind: "success", status: 200 },
      ]),
    ).map((response) => response.id),
  ).toEqual(["earlier", "later", "validation.422"]);
  expect(Effect.runSync(responseContractsEffect(null))).toEqual([
    { id: "validation.422", kind: "validation-error", status: 422 },
  ]);
});

test("orders distinct nested paths that share a dotted text representation", () => {
  const leaves = Effect.runSync(
    collectMappingsEffect({
      kind: "input",
      fields: {
        "a.b": { kind: "body", name: "z" },
        a: { kind: "nested", fields: { b: { kind: "body", name: "a" } } },
      },
    }),
  );
  expect(leaves.map((leaf) => leaf.name)).toEqual(["a", "z"]);
  expect(leaves.map((leaf) => leaf.inputPath)).toEqual([["a", "b"], ["a.b"]]);
  const withoutNestedName = Effect.runSync(
    collectMappingsEffect({
      kind: "input",
      fields: {
        "a.b": { kind: "body", name: "z" },
        a: { kind: "nested", fields: { b: { kind: "body" } } },
      },
    }),
  );
  expect(withoutNestedName.map((leaf) => leaf.name)).toEqual([undefined, "z"]);
  const withoutFlatName = Effect.runSync(
    collectMappingsEffect({
      kind: "input",
      fields: {
        "a.b": { kind: "body" },
        a: { kind: "nested", fields: { b: { kind: "body", name: "z" } } },
      },
    }),
  );
  expect(withoutFlatName.map((leaf) => leaf.name)).toEqual([undefined, "z"]);
});
