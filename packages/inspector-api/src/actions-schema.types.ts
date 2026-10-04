import type { InspectorActionIdentity as IdentitySchema } from "./actions.schemas.js";
import type { Schema } from "effect";

/** Identity derived from the executable boundary schema, without a duplicated shape. */
export interface InspectorActionIdentity extends Schema.Schema.Type<typeof IdentitySchema> {}
