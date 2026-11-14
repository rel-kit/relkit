import { describe, expect, test } from "bun:test";
import { asInputSchema, schemaFields, schemaInput, schemaTemplate } from "./schema-model";

describe("a template from a declared schema", () => {
  test("holds the required properties with a value of the right type", () => {
    const channelParams = {
      type: "object",
      properties: {
        companyId: { type: "string" },
        limit: { type: "integer" },
        verbose: { type: "boolean" },
        scope: { enum: ["day", "week"] },
        tags: { type: "array", items: { type: "string" } },
        filter: { type: "object", properties: { from: { type: "string" } }, required: ["from"] },
        note: { type: "string" },
      },
      required: ["companyId", "limit", "verbose", "scope", "tags", "filter"],
    };
    expect(schemaTemplate(channelParams)).toEqual({
      companyId: "",
      limit: 0,
      verbose: false,
      scope: "day",
      tags: [],
      filter: { from: "" },
    });
  });

  test("uses a declared default, and the input side of a schema node", () => {
    expect(
      schemaTemplate({
        $relkit: "schema",
        jsonSchema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
        inputJsonSchema: {
          type: "object",
          properties: { n: { type: "integer", default: 5 } },
          required: ["n"],
        },
      }),
    ).toEqual({ n: 5 });
  });

  test("is an empty object when nothing is declared", () => {
    expect(schemaTemplate(undefined)).toEqual({});
    expect(schemaTemplate({ type: "object" })).toEqual({});
    expect(schemaTemplate({ type: "object", properties: { a: { type: "string" } } })).toEqual({});
  });

  test("takes the first branch of a union and the real type of a nullable one", () => {
    expect(
      schemaTemplate({
        type: "object",
        properties: {
          a: { anyOf: [{ type: "number" }, { type: "string" }] },
          b: { type: ["null", "string"] },
        },
        required: ["a", "b"],
      }),
    ).toEqual({ a: 0, b: "" });
  });
});

/** A schema node as the graph carries it: the decoded type and the type callers send. */
const withDefault = {
  $relkit: "schema",
  jsonSchema: {
    type: "object",
    properties: { limit: { type: "integer", default: 10 }, id: { type: "string" } },
    required: ["limit", "id"],
  },
  inputJsonSchema: {
    type: "object",
    properties: { limit: { type: "integer", default: 10 }, id: { type: "string" } },
    required: ["id"],
  },
};

describe("forms read the input schema", () => {
  test("a field with a default is optional", () => {
    const fields = schemaFields(withDefault);
    expect(fields.map((field) => [field.key, field.required])).toEqual([
      ["limit", false],
      ["id", true],
    ]);
  });

  test("a missing optional field is not an error and a missing required one is", () => {
    expect(schemaInput(withDefault, { id: "a" })).toEqual({ value: { id: "a" }, errors: [] });
    expect(schemaInput(withDefault, {}).errors).toEqual(["id is required."]);
  });

  test("falls back to the decoded schema when no input schema is declared", () => {
    const decoded = { $relkit: "schema", jsonSchema: withDefault.jsonSchema };
    expect(schemaFields(decoded).every((field) => field.required)).toBe(true);
  });

  test("shows a contract as its input schema", () => {
    const shown = asInputSchema(withDefault) as { jsonSchema: { required: string[] } };
    expect(shown.jsonSchema.required).toEqual(["id"]);
    expect(asInputSchema({ type: "object" })).toEqual({ type: "object" });
    expect(asInputSchema(undefined)).toBeUndefined();
  });
});
