import type { Schema } from "./standard-schema.types.js";

/**
 * Constraints for a buffered Web File validator.
 * @example const options: FileSchemaOptions = { maxBytes: 1024, mediaTypes: ["image/*"] };
 */
export interface FileSchemaOptions {
  readonly maxBytes?: number;
  readonly mediaTypes?: readonly string[];
}

/**
 * A schema that accepts and returns a Web File.
 * @example const schema: FileSchema = z.file();
 */
export type FileSchema = Schema<File, File>;
