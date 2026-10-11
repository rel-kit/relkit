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

/** Ordered package identities preserved in the serialized runtime plan. */
export const CommerceRuntimePackages = Schema.Struct({
  integrations: Schema.Array(Schema.Struct({ packageName: Schema.String })),
});
