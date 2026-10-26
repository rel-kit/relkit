/**
 * Retains manifest entrypoints and build producers alongside dependency fields
 * for the ownership inventory. These are source declarations; installed closure
 * and consumed public types are verified independently by external fixtures.
 */
import { Schema } from "effect";
import { ConsumerManifest } from "./consumer-installation.schemas.js";

/** Source manifest fields used by the ownership report and catalog resolver. */
export const OwnershipManifest = Schema.Struct({
  ...ConsumerManifest.fields,
  private: Schema.optionalKey(Schema.Boolean),
  exports: Schema.optionalKey(Schema.Json),
  bin: Schema.optionalKey(Schema.Json),
  main: Schema.optionalKey(Schema.String),
  module: Schema.optionalKey(Schema.String),
  types: Schema.optionalKey(Schema.String),
  scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  catalog: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  catalogs: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)),
  ),
});
