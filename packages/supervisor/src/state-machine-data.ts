import type { SupervisorCandidatePhase, SupervisorCandidateStep } from "./state-machine.types.js";

/** Legal candidate phases, next states and stable lifecycle outcome labels. */
export const SUPERVISOR_CANDIDATE_STEPS: Record<SupervisorCandidatePhase, SupervisorCandidateStep> =
  {
    compile: {
      expected: "compiling-candidate",
      next: "starting-candidate",
      success: "compile-succeeded",
      failure: "compile-failed",
    },
    start: {
      expected: "starting-candidate",
      next: "verifying-hash-and-readiness",
      success: "start-succeeded",
      failure: "start-failed",
    },
    verification: {
      expected: "verifying-hash-and-readiness",
      next: "switching",
      success: "verification-succeeded",
      failure: "verification-failed",
    },
  };
