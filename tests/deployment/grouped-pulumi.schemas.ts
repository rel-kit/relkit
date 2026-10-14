/** Native registered Pulumi resource identities compared across paired physical service layouts. */
import { Schema } from "effect";

/** Resource type and logical name after the actual mocked engine accepts registration. */
export const NativeMockResource = Schema.Struct({ type: Schema.String, name: Schema.String });
/** Complete native resource registration projection, with no source-path normalization. */
export const NativeMockResources = Schema.Array(NativeMockResource);
