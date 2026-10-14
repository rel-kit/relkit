/** Precise native signup, issued identity and retained realtime frame contracts for private protection acceptance. */
import { Schema } from "effect";

/** Native Better Auth response fields required to prove actual user ownership. */
export const ProtectedSignup = Schema.Struct({
  user: Schema.Struct({ id: Schema.String, email: Schema.String }),
});
/** Server-issued identity required by the native client protocol. */
export const ProtectedIdentity = Schema.Struct({
  identityScope: Schema.String,
  sessionEpoch: Schema.String,
});
/** Private test-owned cookie and validated subject metadata; values are never copied to evidence. */
export const ProtectedUser = Schema.Struct({
  ownerId: Schema.String,
  tenant: Schema.String,
  cookie: Schema.String,
  identityScope: Schema.String,
  sessionEpoch: Schema.String,
});
/** Native event projection retains the complete original checkpoint for replay. */
export const ProtectedEventFrame = Schema.Struct({
  kind: Schema.Literal("event"),
  event: Schema.String,
  payload: Schema.Struct({ message: Schema.String }),
  checkpoint: Schema.Record(Schema.String, Schema.Json),
});
/** Native initial presence frame used to prove lease ownership before event consumption. */
export const ProtectedPresenceFrame = Schema.Struct({
  kind: Schema.Literal("presence"),
  presence: Schema.Struct({ connections: Schema.Number }),
});
