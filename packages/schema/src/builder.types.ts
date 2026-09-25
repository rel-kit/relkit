import type { FileSchema, FileSchemaOptions } from "./file.types.js";
import type {
  AnySchema,
  InputOf,
  ObjectInput,
  ObjectOutput,
  OutputOf,
  SchemaTuple,
  Shape,
} from "./builder-composites.types.js";
import type { NumberSchema, StringSchema } from "./builder-refinements.types.js";
import type { Schema } from "./standard-schema.types.js";

export type {
  AnySchema,
  InputOf,
  ObjectInput,
  ObjectOutput,
  OutputOf,
  SchemaTuple,
  Shape,
} from "./builder-composites.types.js";
export type { NumberSchema, StringSchema } from "./builder-refinements.types.js";

/**
 * Builder methods used to compose Standard Schema validators.
 * @example const builder: ZBuilder = z;
 */
export interface ZBuilder {
  /**
   * Builds a string validator.
   * @returns A string schema with refinement methods.
   * @example z.string().min(1);
   */
  string(): StringSchema;
  /**
   * Builds a finite-number validator.
   * @returns A number schema with refinement methods.
   * @example z.number().int();
   */
  number(): NumberSchema;
  /**
   * Builds a boolean validator.
   * @returns A boolean schema.
   * @example z.boolean().parse(true);
   */
  boolean(): Schema<boolean, boolean>;
  /**
   * Builds a validator accepting any input without changing it.
   * @returns An unknown-value schema.
   * @example z.unknown().parse({ name: "Ada" });
   */
  unknown(): Schema<unknown, unknown>;
  /**
   * Builds an unrestricted value validator.
   * @returns An unknown-value schema.
   * @example z.any().parse(null);
   */
  any(): Schema<unknown, unknown>;
  /**
   * Builds a null validator.
   * @returns A null schema.
   * @example z.null().parse(null);
   */
  null(): Schema<null, null>;
  /**
   * Builds a buffered Web File validator.
   * @param options - Byte and media-type constraints.
   * @returns A File schema.
   * @example z.file({ maxBytes: 1024 });
   */
  file(options?: FileSchemaOptions): FileSchema;
  /**
   * Builds an undefined validator.
   * @returns An undefined schema.
   * @example z.undefined().parse(undefined);
   */
  undefined(): Schema<undefined, undefined>;
  /**
   * Builds a void-result validator.
   * @returns An undefined schema.
   * @example z.void().parse(undefined);
   */
  void(): Schema<undefined, undefined>;
  /**
   * Builds an exact-value validator.
   * @param value - Literal value to require.
   * @returns A literal schema.
   * @example z.literal("ready").parse("ready");
   */
  literal<T extends string | number | boolean | null | undefined>(value: T): Schema<T, T>;
  /**
   * Builds a named object validator.
   * @param shape - Child schemas by property name.
   * @returns An object schema with inferred input and output.
   * @example z.object({ id: z.string() });
   */
  object<S extends Shape>(shape: S): Schema<ObjectInput<S>, ObjectOutput<S>>;
  /**
   * Builds an array validator.
   * @param schema - Child item schema.
   * @returns An array schema with inferred item types.
   * @example z.array(z.number());
   */
  array<S extends AnySchema>(schema: S): Schema<InputOf<S>[], OutputOf<S>[]>;
  /**
   * Builds a nonempty union validator.
   * @param schemas - Member schemas in precedence order.
   * @returns A union schema with inferred member types.
   * @example z.union([z.string(), z.number()]);
   */
  union<S extends SchemaTuple>(schemas: S): Schema<InputOf<S[number]>, OutputOf<S[number]>>;
}
