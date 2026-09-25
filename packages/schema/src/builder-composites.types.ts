import type { InferInput, InferOutput, StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Any compatible validator accepted by a composite builder.
 * @example const child: AnySchema = z.string();
 */
export type AnySchema = StandardSchemaV1;
/**
 * Named child validators for an object schema.
 * @example const shape: Shape = { id: z.string() };
 */
export type Shape = Record<string, AnySchema>;
/**
 * Accepted input of a child validator.
 * @example type Input = InputOf<typeof schema>;
 */
export type InputOf<S extends AnySchema> = InferInput<S>;
/**
 * Validated output of a child validator.
 * @example type Output = OutputOf<typeof schema>;
 */
export type OutputOf<S extends AnySchema> = InferOutput<S>;
type OptionalInputKeys<S extends Shape> = {
  [K in keyof S]-?: undefined extends InputOf<S[K]> ? K : never;
}[keyof S];
type OptionalOutputKeys<S extends Shape> = {
  [K in keyof S]-?: undefined extends OutputOf<S[K]> ? K : never;
}[keyof S];
type RequiredInputKeys<S extends Shape> = Exclude<keyof S, OptionalInputKeys<S>>;
type RequiredOutputKeys<S extends Shape> = Exclude<keyof S, OptionalOutputKeys<S>>;
/**
 * Object input with optional keys inferred from child schemas.
 * @example type Input = ObjectInput<{ id: typeof idSchema }>;
 */
export type ObjectInput<S extends Shape> = {
  [K in RequiredInputKeys<S>]: InputOf<S[K]>;
} & {
  [K in OptionalInputKeys<S>]?: Exclude<InputOf<S[K]>, undefined>;
};
/**
 * Object output with optional keys inferred from child schemas.
 * @example type Output = ObjectOutput<{ id: typeof idSchema }>;
 */
export type ObjectOutput<S extends Shape> = {
  [K in RequiredOutputKeys<S>]: OutputOf<S[K]>;
} & {
  [K in OptionalOutputKeys<S>]?: Exclude<OutputOf<S[K]>, undefined>;
};
/**
 * Nonempty tuple of union members, preserving declaration order.
 * @example const members: SchemaTuple = [z.string(), z.number()];
 */
export type SchemaTuple = readonly [AnySchema, ...AnySchema[]];
