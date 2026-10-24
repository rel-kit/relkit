/**
 * Defines the private discovery and live identity wire contract. Descriptors
 * contain only connection authority and process identity; configuration, runtime
 * values and business records never participate in discovery.
 */
import { Schema } from "effect";

/** Protocol changes independently from the diagnostic storage schema. */
export const INSPECTION_PROTOCOL = 1;

/** Project identity is a digest of the canonical root, not a disclosed path. */
export const InspectionProjectId = Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/));

/** Session identities are fresh UUIDs, never generation IDs or process IDs. */
export const InspectionSessionId = Schema.String.check(Schema.isUUID(4));

/** Credentials use 256 random bits represented as unpadded base64url. */
export const InspectionToken = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));

/** A descriptor names an HTTP origin, excluding credentials, paths and queries. */
export const InspectionEndpoint = Schema.String.check(
  Schema.isPattern(/^http:\/\/(?:\[[a-fA-F0-9:]+\]|[A-Za-z0-9.-]+):[1-9][0-9]{0,4}$/),
  Schema.makeFilter((value: string) => {
    try {
      return Number(new URL(value).port) <= 65_535;
    } catch {
      return false;
    }
  }),
);

/** Private session discovery data; the token is server-only launch authority. */
export const InspectionDescriptorSchema = Schema.Struct({
  protocol: Schema.Literal(INSPECTION_PROTOCOL),
  projectId: InspectionProjectId,
  sessionId: InspectionSessionId,
  endpoint: InspectionEndpoint,
  process: Schema.Struct({
    pid: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
    startedAt: Schema.String,
  }),
  createdAt: Schema.String,
  token: InspectionToken,
});

/** An authenticated live response proves identity rather than relying on PID liveness. */
export const InspectionHandshakeSchema = Schema.Struct({
  protocol: Schema.Literal(INSPECTION_PROTOCOL),
  projectId: InspectionProjectId,
  sessionId: InspectionSessionId,
  generationId: Schema.optionalKey(Schema.String),
  capabilities: Schema.Array(Schema.String),
});
