import { Schema } from "effect";

/** Authored manifest fields needed to derive an application ID; other fields are retained. */
export const projectPackageSchema = Schema.Struct({ name: Schema.String });
