import type { Exit } from "effect";

/** Fixed owners of internal execution operations. */
export type ExecutionDomain =
  "runtime" | "local" | "engine" | "http" | "client" | "inspector" | "supervisor" | "testing";

/** Declaration-owned workload names and non-negative counts; never input identities. */
export type ExecutionWorkload = Readonly<Record<string, number>>;

/** Terminal operation classification; mixed defects take precedence over interruption. */
export type ExecutionOutcome = "success" | "failure" | "defect" | "interrupted";

/**
 * Distinguishes a completed operation from nonterminal control flow.
 * @typeParam A - Successful operation value.
 * @typeParam E - Expected operation failure.
 * @param exit - Original operation exit, before compatibility translation.
 * @returns True for automatic Cause classification, a bounded domain outcome, or false for suspension.
 * @remarks False retains start/workload counts and preserves the original exit.
 */
export type ExecutionTerminalPolicy<A, E> = (exit: Exit.Exit<A, E>) => boolean | ExecutionOutcome;
