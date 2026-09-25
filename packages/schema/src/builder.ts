import { createSchema, issue } from "./standard-schema.js";
import { buildSchema } from "./builder-effect.js";
import type { Schema } from "./standard-schema.types.js";
import { arraySchema, objectSchema, unionSchema } from "./builder-composites.js";
import { numberSchema, stringSchema } from "./builder-refinements.js";
import { fileSchema } from "./file.js";
import type { JsonValue } from "./standard-schema.types.js";
import type { ZBuilder } from "./builder.types.js";

export type {
  AnySchema,
  InputOf,
  NumberSchema,
  ObjectInput,
  ObjectOutput,
  OutputOf,
  SchemaTuple,
  Shape,
  StringSchema,
  ZBuilder,
} from "./builder.types.js";

/**
 * Builds RELKIT Standard Schema validators with familiar composition helpers.
 *
 * @example
 * ```ts
 * import { z } from "@relkit/app/schema"
 *
 * const order = z.object({ id: z.string(), quantity: z.number().int().positive() })
 * order.parse({ id: "order-1", quantity: 2 })
 * ```
 * @category Schemas
 * @since 0.1.0
 */
export const z: ZBuilder = {
  string: () => stringSchema(),
  number: () => numberSchema(),
  boolean: () =>
    buildSchema("builder.boolean", () =>
      primitiveSchema("boolean", (value): value is boolean => typeof value === "boolean"),
    ),
  unknown: () =>
    buildSchema("builder.unknown", () =>
      createSchema((value) => ({ value }), { jsonSchema: () => ({}) }),
    ),
  any: () =>
    buildSchema("builder.any", () =>
      createSchema((value) => ({ value }), { jsonSchema: () => ({}) }),
    ),
  null: () =>
    buildSchema("builder.null", () =>
      primitiveSchema("null", (value): value is null => value === null),
    ),
  file: fileSchema,
  undefined: undefinedSchema,
  void: undefinedSchema,
  literal: literalSchema,
  object: objectSchema,
  array: arraySchema,
  union: unionSchema,
};

function primitiveSchema<T>(name: string, guard: (value: unknown) => value is T): Schema<T, T> {
  return createSchema(
    (value, path) => (guard(value) ? { value } : issue(`Expected ${name}`, path)),
    { jsonSchema: () => ({ type: name }) },
  );
}

function literalSchema<T extends string | number | boolean | null | undefined>(
  expected: T,
): Schema<T, T> {
  return buildSchema("builder.literal", () =>
    createSchema(
      (value, path) =>
        Object.is(value, expected)
          ? { value: expected }
          : issue(`Expected ${String(expected)}`, path),
      {
        jsonSchema: () =>
          expected === undefined ? { "x-relkit-void": true } : { const: expected as JsonValue },
      },
    ),
  );
}

function undefinedSchema(): Schema<undefined, undefined> {
  return buildSchema("builder.undefined", () =>
    createSchema(
      (value, path) => (value === undefined ? { value } : issue("Expected undefined", path)),
      { jsonSchema: () => ({ "x-relkit-void": true }) },
    ),
  );
}
