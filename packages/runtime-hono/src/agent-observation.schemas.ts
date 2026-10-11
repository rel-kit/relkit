/**
 * Validates incoming journal checkpoints before observation reaches a provider.
 * The codec mirrors the owner contract's partition fields and decimal sequence;
 * authentication remains ahead of this promotion in the request-owned stream.
 */
import { Schema } from "effect";

/** Partition names are required nonempty strings, matching the transport cursor guard. */
const CheckpointIdentity = Schema.String.check(Schema.isMinLength(1));

/** Full journal identity required by provider read/wait methods. */
export const ObservationCheckpoint = Schema.Struct({
  applicationId: CheckpointIdentity,
  environment: CheckpointIdentity,
  profile: CheckpointIdentity,
  providerEpoch: CheckpointIdentity,
  threadId: CheckpointIdentity,
  sequence: Schema.String.check(Schema.isPattern(/^(0|[1-9]\d*)$/)),
});
