import { Schema } from "effect";
import { SupervisorSequenceSchema } from "./state-machine.schemas.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";

const isSupervisorSequence = Schema.is(SupervisorSequenceSchema);

/**
 * Validates the selective token fields against the authoritative sequence schema.
 * @param token - Candidate identity; unrelated properties are never accessed.
 * @returns Nothing for positive safe integers.
 * @throws Existing TypeError messages for invalid source or generation sequences.
 */
export function validateSupervisorToken(token: SupervisorCandidateToken): void {
  if (!isSupervisorSequence(token.sourceToken))
    throw new TypeError("Supervisor source tokens must be positive safe integers.");
  if (!isSupervisorSequence(token.generationToken))
    throw new TypeError("Supervisor generation tokens must be positive safe integers.");
}
