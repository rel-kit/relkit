import type { Schema } from "effect";
import type * as Models from "./source-map-schema.js";
import type { ParsedSource } from "./source-map-utils.types.js";

/** Export identity classification; default retains its special source-derived identity. */
export type ExportKind = Schema.Schema.Type<typeof Models.ExportKind>;

/** Supplemental source contract; getters are evaluated only during mapping. */
export interface SourceMapSource extends Schema.Schema.Type<typeof Models.SourceMapSource> {}

/** Mapping settings derived from the runtime source contract. */
export interface SourceMapOptions extends Schema.Schema.Type<typeof Models.SourceMapOptions> {}

/** Immutable export provenance returned by the mapping boundary. */
export interface SourceMapEntry extends Schema.Schema.Type<typeof Models.SourceMapEntry> {}

/** Located AST provenance before it is associated with an evaluated export. */
export interface LocatedSource extends Schema.Schema.Type<typeof Models.LocatedSource> {}

/** Exclusive invocation-owned caches, kept structural because these are capabilities. */
export interface MapContext {
  readonly root: string;
  readonly texts: Map<string, string>;
  readonly parsed: Map<string, ParsedSource | undefined>;
}
