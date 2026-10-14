/** Derives private test user metadata from its actual validated native schema. */
import type { Schema } from "effect";
import type * as Models from "./generated-protection.schemas.js";

/** Scope-owned test cookie and server-issued subject/identity metadata. */
export interface ProtectedUser extends Schema.Schema.Type<typeof Models.ProtectedUser> {}
