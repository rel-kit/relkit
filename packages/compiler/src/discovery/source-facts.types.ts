import type { Schema } from "effect";
import type * as Models from "./source-facts-schema.js";

/** Syntax-recognized factory category, including compiler-only categories. */
export type SourceFactoryKind = Schema.Schema.Type<typeof Models.SourceFactoryKind>;

/** Whether syntax proves an ID is explicit, omitted, or undecidable. */
export type FactoryIdPresence = Schema.Schema.Type<typeof Models.FactoryIdPresence>;

/** Factory call evidence used by source identity assignment. */
export interface FactoryBindingFact extends Schema.Schema.Type<typeof Models.FactoryBindingFact> {}

/** A route export's method and source position. */
export interface RouteOperationFact extends Schema.Schema.Type<typeof Models.RouteOperationFact> {}

/** A declared service member and its source-local target. */
export interface ServiceMemberFact extends Schema.Schema.Type<typeof Models.ServiceMemberFact> {}

/** A constant error binding and source ID evidence. */
export interface ErrorBindingFact extends Schema.Schema.Type<typeof Models.ErrorBindingFact> {}

/** A runtime export with optional factory and upstream identity evidence. */
export interface ExportFact extends Schema.Schema.Type<typeof Models.ExportFact> {}

/** Runtime export lookup and position-ordered facts for one file. */
export interface ExportFacts extends Schema.Schema.Type<typeof Models.ExportFacts> {}

/** Compatibility name for a parsed file's export evidence. */
export type SourceFacts = ExportFacts;

/** A declaration's evidence before export linking. */
export interface LocalBinding extends Schema.Schema.Type<typeof Models.LocalBinding> {}

/** A factory's identity category and omitted-ID policy. */
export interface FactoryDefinition extends Schema.Schema.Type<typeof Models.FactoryDefinition> {}
