import type { JsonValue, RelkitSchema, StandardResult } from "./standard-schema.types.js";

/**
 * Directional JSON Schema projection hooks carried by a RELKIT schema.
 * @example const hooks: SchemaProjectionHooks = { jsonSchema: () => ({ type: "string" }) };
 */
export interface SchemaProjectionHooks {
  readonly jsonSchema?: () => JsonValue;
  readonly inputJsonSchema?: () => JsonValue;
  readonly outputJsonSchema?: () => JsonValue;
}

/**
 * RELKIT schema with parsing and composition methods.
 * Input and output types may differ after transformation.
 * @example const schema: Schema<string, number> = z.string().transform(Number);
 */
export interface Schema<TInput = unknown, TOutput = TInput> extends RelkitSchema<TInput, TOutput> {
  /**
   * Accepts undefined as input and output.
   * @returns A schema with optional value types.
   * @example z.string().optional();
   */
  optional(): Schema<TInput | undefined, TOutput | undefined>;
  /**
   * Accepts null as input and output.
   * @returns A nullable schema.
   * @example z.string().nullable();
   */
  nullable(): Schema<TInput | null, TOutput | null>;
  /**
   * Supplies a value for undefined input.
   * @param value - Constant or lazy default.
   * @returns A schema with optional input and required output.
   * @example z.string().default("ready");
   */
  default(value: TInput | (() => TInput)): Schema<TInput | undefined, TOutput>;
  /**
   * Maps a valid output to a new value.
   * @param transform - Synchronous or asynchronous mapper.
   * @returns A schema with the mapped output type.
   * @example z.string().transform(Number);
   */
  transform<TNext>(transform: (value: TOutput) => TNext | Promise<TNext>): Schema<TInput, TNext>;
  /**
   * Checks a valid output with a predicate.
   * @param check - Predicate for valid output.
   * @param message - Failure message.
   * @returns A refined schema.
   * @example z.number().refine((value) => value > 0);
   */
  refine(
    check: (value: TOutput) => boolean | Promise<boolean>,
    message?: string,
  ): Schema<TInput, TOutput>;
  /**
   * Parses synchronously or throws.
   * @param value - Input to parse.
   * @returns Validated output.
   * @throws SchemaValidationError or TypeError for invalid or asynchronous input.
   * @example z.string().parse("ready");
   */
  parse(value: unknown): TOutput;
  /**
   * Parses and awaits asynchronous checks.
   * @param value - Input to parse.
   * @returns A promise of validated output.
   * @throws SchemaValidationError for invalid input.
   * @example await z.string().parseAsync("ready");
   */
  parseAsync(value: unknown): Promise<TOutput>;
  /**
   * Returns a result for sync or async validation.
   * @param value - Input to validate.
   * @returns A result or promise with value or issues.
   * @example z.string().safeParse("ready");
   */
  safeParse(value: unknown): StandardResult<TOutput> | Promise<StandardResult<TOutput>>;
}
