import type { Schema } from "effect";
import type { RoutingEntrySchema, RoutingManifestSchema } from "./worker-entries-support.js";

/** Historical binding identity derived from the persisted schema. */
export interface RoutingEntry extends Schema.Schema.Type<typeof RoutingEntrySchema> {}

/** Decoded historical routing document. */
export interface RoutingManifest extends Schema.Schema.Type<typeof RoutingManifestSchema> {}
