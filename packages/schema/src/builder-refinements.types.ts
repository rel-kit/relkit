import type { Schema } from "./standard-schema.types.js";

/**
 * String schema with length and format refinement methods.
 * @example const schema: StringSchema = z.string().min(1);
 */
export interface StringSchema extends Schema<string, string> {
  /**
   * Requires a minimum string length.
   * @param length - Minimum length.
   * @param message - Optional issue text.
   * @returns A refined string schema.
   * @example z.string().min(2);
   */
  min(length: number, message?: string): StringSchema;
  /**
   * Requires a maximum string length.
   * @param length - Maximum length.
   * @param message - Optional issue text.
   * @returns A refined string schema.
   * @example z.string().max(8);
   */
  max(length: number, message?: string): StringSchema;
  /**
   * Requires a UUID string.
   * @param message - Optional issue text.
   * @returns A UUID string schema.
   * @example z.string().uuid();
   */
  uuid(message?: string): StringSchema;
  /**
   * Requires a parseable datetime string.
   * @param message - Optional issue text.
   * @returns A datetime string schema.
   * @example z.string().datetime();
   */
  datetime(message?: string): StringSchema;
  /**
   * Requires an email address string.
   * @param message - Optional issue text.
   * @returns An email string schema.
   * @example z.string().email();
   */
  email(message?: string): StringSchema;
}

/**
 * Finite-number schema with range and integer refinement methods.
 * @example const schema: NumberSchema = z.number().int();
 */
export interface NumberSchema extends Schema<number, number> {
  /**
   * Requires an inclusive minimum.
   * @param value - Minimum value.
   * @param message - Optional issue text.
   * @returns A refined number schema.
   * @example z.number().min(1);
   */
  min(value: number, message?: string): NumberSchema;
  /**
   * Requires an inclusive maximum.
   * @param value - Maximum value.
   * @param message - Optional issue text.
   * @returns A refined number schema.
   * @example z.number().max(10);
   */
  max(value: number, message?: string): NumberSchema;
  /**
   * Requires an integer.
   * @param message - Optional issue text.
   * @returns An integer schema.
   * @example z.number().int();
   */
  int(message?: string): NumberSchema;
  /**
   * Requires a value above zero.
   * @param message - Optional issue text.
   * @returns A positive number schema.
   * @example z.number().positive();
   */
  positive(message?: string): NumberSchema;
  /**
   * Requires a value of zero or greater.
   * @param message - Optional issue text.
   * @returns A nonnegative number schema.
   * @example z.number().nonnegative();
   */
  nonnegative(message?: string): NumberSchema;
}
