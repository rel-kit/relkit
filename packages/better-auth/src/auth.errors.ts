import { Schema } from "effect";

/** Typed authentication boundary failure retaining the original SDK exception. */
export class AuthFailure extends Schema.TaggedError<AuthFailure>()("AuthFailure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
