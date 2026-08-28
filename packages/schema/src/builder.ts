import {
  createSchema,
  issue,
  type InferInput,
  type InferOutput,
  type Schema,
  type StandardSchemaV1,
} from "./standard-schema.js";
import { arraySchema, objectSchema, unionSchema } from "./builder-composites.js";
import { numberSchema, stringSchema } from "./builder-refinements.js";
import { fileSchema, type FileSchema, type FileSchemaOptions } from "./file.js";
import type { JsonValue } from "./standard-schema.js";

export type AnySchema = StandardSchemaV1;
export type Shape = Record<string, AnySchema>;
export type InputOf<S extends AnySchema> = InferInput<S>;
export type OutputOf<S extends AnySchema> = InferOutput<S>;
type OptionalInputKeys<S extends Shape> = {
  [K in keyof S]-?: undefined extends InputOf<S[K]> ? K : never;
}[keyof S];
type OptionalOutputKeys<S extends Shape> = {
  [K in keyof S]-?: undefined extends OutputOf<S[K]> ? K : never;
}[keyof S];
type RequiredInputKeys<S extends Shape> = Exclude<keyof S, OptionalInputKeys<S>>;
type RequiredOutputKeys<S extends Shape> = Exclude<keyof S, OptionalOutputKeys<S>>;
export type ObjectInput<S extends Shape> = {
  [K in RequiredInputKeys<S>]: InputOf<S[K]>;
} & {
  [K in OptionalInputKeys<S>]?: Exclude<InputOf<S[K]>, undefined>;
};
export type ObjectOutput<S extends Shape> = {
  [K in RequiredOutputKeys<S>]: OutputOf<S[K]>;
} & {
  [K in OptionalOutputKeys<S>]?: Exclude<OutputOf<S[K]>, undefined>;
};
export type SchemaTuple = readonly [AnySchema, ...AnySchema[]];

/** A string schema with the common v3 format and length refinements. */
export interface StringSchema extends Schema<string, string> {
  min(length: number, message?: string): StringSchema;
  max(length: number, message?: string): StringSchema;
  uuid(message?: string): StringSchema;
  datetime(message?: string): StringSchema;
  email(message?: string): StringSchema;
}

/** A finite-number schema with the common v3 numeric refinements. */
export interface NumberSchema extends Schema<number, number> {
  min(value: number, message?: string): NumberSchema;
  max(value: number, message?: string): NumberSchema;
  int(message?: string): NumberSchema;
  positive(message?: string): NumberSchema;
  nonnegative(message?: string): NumberSchema;
}

/** The dependency-free familiar builder exposed as `z`. */
export interface ZBuilder {
  string(): StringSchema;
  number(): NumberSchema;
  boolean(): Schema<boolean, boolean>;
  unknown(): Schema<unknown, unknown>;
  any(): Schema<unknown, unknown>;
  null(): Schema<null, null>;
  file(options?: FileSchemaOptions): FileSchema;
  undefined(): Schema<undefined, undefined>;
  void(): Schema<undefined, undefined>;
  literal<T extends string | number | boolean | null | undefined>(value: T): Schema<T, T>;
  object<S extends Shape>(shape: S): Schema<ObjectInput<S>, ObjectOutput<S>>;
  array<S extends AnySchema>(schema: S): Schema<InputOf<S>[], OutputOf<S>[]>;
  union<S extends SchemaTuple>(schemas: S): Schema<InputOf<S[number]>, OutputOf<S[number]>>;
}

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
    primitiveSchema("boolean", (value): value is boolean => typeof value === "boolean"),
  unknown: () => createSchema((value) => ({ value }), { jsonSchema: () => ({}) }),
  any: () => createSchema((value) => ({ value }), { jsonSchema: () => ({}) }),
  null: () => primitiveSchema("null", (value): value is null => value === null),
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
  return createSchema(
    (value, path) =>
      Object.is(value, expected)
        ? { value: expected }
        : issue(`Expected ${String(expected)}`, path),
    {
      jsonSchema: () =>
        expected === undefined ? { "x-relkit-void": true } : { const: expected as JsonValue },
    },
  );
}

function undefinedSchema(): Schema<undefined, undefined> {
  return createSchema(
    (value, path) => (value === undefined ? { value } : issue("Expected undefined", path)),
    { jsonSchema: () => ({ "x-relkit-void": true }) },
  );
}
