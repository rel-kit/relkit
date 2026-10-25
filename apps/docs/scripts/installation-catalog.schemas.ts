/**
 * Decodes documentation's package metadata without loading integration code.
 * Only fields used by installation recipes cross this boundary; runtime SDK
 * requirements reuse the contracts package's own capability/phase schema.
 */
import { IntegrationDependencyRequirements } from "@relkit/contracts";
import { Schema } from "effect";

export const InstallationManifest = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  peerDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  relkit: Schema.optionalKey(
    Schema.Struct({
      integration: Schema.optionalKey(
        Schema.Struct({
          dependencies: Schema.optionalKey(IntegrationDependencyRequirements),
        }),
      ),
    }),
  ),
});

export const InstallationWorkspace = Schema.Struct({
  catalog: Schema.Record(Schema.String, Schema.String),
  catalogs: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)),
});
