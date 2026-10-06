import { Schema } from "effect";

/** Readiness dimensions retained by the generated HTTP health contract. */
export const RuntimeAreaSchema = Schema.Literals([
  "provider",
  "database",
  "auth",
  "nativeWorker",
  "server",
]);

/** Internal failures retain native evidence without changing public error constructors. */
export class ServerRuntimeFailure extends Schema.TaggedError<ServerRuntimeFailure>()(
  "ServerRuntimeFailure",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/** Published state is initialized before any startup or worker fiber can run. */
export const RuntimeSnapshotSchema = Schema.Struct({
  stopping: Schema.Boolean,
  ready: Schema.Struct({
    provider: Schema.Boolean,
    database: Schema.Boolean,
    auth: Schema.Boolean,
    nativeWorker: Schema.Boolean,
    server: Schema.Boolean,
  }),
  primaryFailures: Schema.Array(ServerRuntimeFailure),
  cleanupFailures: Schema.Array(ServerRuntimeFailure),
  timedOut: Schema.Array(Schema.String),
  pendingInvocations: Schema.Number,
});
