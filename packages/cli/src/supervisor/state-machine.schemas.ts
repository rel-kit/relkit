import { Schema } from "effect";

/** Exact public lifecycle vocabulary; failure returns to idle or the active generation. */
export const SUPERVISOR_STATES = [
  "idle",
  "compiling-candidate",
  "starting-candidate",
  "verifying-hash-and-readiness",
  "switching",
  "draining-previous",
  "active",
] as const;

/** Authoritative lifecycle state contract. */
export const SupervisorStateSchema = Schema.Literals(SUPERVISOR_STATES);

/** Tokens are positive safe integers, preserving existing validation limits. */
export const SupervisorSequenceSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
);

/** Candidate identity decoded at the supervisor boundary. */
export const SupervisorCandidateTokenSchema = Schema.Struct({
  sourceToken: SupervisorSequenceSchema,
  generationToken: SupervisorSequenceSchema,
});

/** Internal state failure translated to the existing public Error at the facade. */
export class ActivationTransitionError extends Schema.TaggedError<ActivationTransitionError>()(
  "ActivationTransitionError",
  { message: Schema.String },
) {}
