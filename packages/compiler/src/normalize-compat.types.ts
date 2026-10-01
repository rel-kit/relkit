import type { SchemaDirection } from "./normalize-schema-projection.js";

/** Descriptor-owned schema index key, validator, and optional wire direction. */
export type SchemaEntry = readonly [string, unknown, SchemaDirection?];
