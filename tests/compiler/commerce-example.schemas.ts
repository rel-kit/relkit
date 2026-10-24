/**
 * Decodes compiler artifact projections used by the commerce acceptance test.
 * Native JSON is promoted immediately to exact plan fields; executable behavior
 * stays in generated manifests and never acquires authority through these codecs.
 */
import { Schema } from "effect";

/** Ordered local binding identities preserved in the serialized plan. */
export const CommerceLocalBindings = Schema.Struct({
  services: Schema.Array(Schema.Struct({ bindingId: Schema.String })),
});

/** Ordered capability registrations and owning modules in the runtime plan. */
export const CommerceRuntimePackages = Schema.Struct({
  integrations: Schema.Array(
    Schema.Struct({
      capability: Schema.String,
      adapterId: Schema.String,
      packageName: Schema.String,
      packageVersion: Schema.String,
      exportName: Schema.String,
    }),
  ),
});
