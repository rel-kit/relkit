/**
 * Derives authored and resolved bridge settings from their shared schemas so
 * application declarations and compiler defaults cannot disagree on ownership.
 */
import type { Schema } from "effect";
import type {
  InspectorConfigurationSchema,
  InspectorConfigurationInputSchema,
} from "./inspector-config.schemas.js";

/** Optional application input; installation of the standalone tool is independent. */
export interface InspectorConfigurationInput extends Schema.Schema.Type<
  typeof InspectorConfigurationInputSchema
> {}

/** Immutable bridge settings after validation and default application. */
export interface InspectorConfiguration extends Schema.Schema.Type<
  typeof InspectorConfigurationSchema
> {}
