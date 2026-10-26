/** Validates native pins and patch identity from the candidate creator's packed manifest. */
import { Schema } from "effect";

/** Only packed creator metadata supplies the external fixture's upstream dependency pins. */
export const PackedTypeCatalog = Schema.Struct({
  buildCatalog: Schema.Struct({
    dependencies: Schema.Record(Schema.String, Schema.String),
    patches: Schema.Struct({
      "drizzle-orm": Schema.Struct({
        key: Schema.String,
        asset: Schema.String,
        hash: Schema.String,
      }),
    }),
  }),
});
