/**
 * Watches an unpublished generation while it is verified. A process that exits before it is
 * verified (a module that does not parse or throws while loading, a configuration that fails at
 * startup) fails the attempt at once with its exit code and the standard error it wrote, instead
 * of leaving verification to poll until its health timeout. While a reload is unverified the
 * candidate's output is held: a generation that becomes active, or fails for another reason, logs
 * it as before; one that exits reports it inside the failure, so the developer sees one error
 * block rather than application warnings followed by a generic failure.
 */
import { Data, Effect } from "effect";
import { cliAdapterError } from "../cli-errors.js";
import type { StartedCandidate } from "../supervisor/index.js";
import type { DevActivationAttempt, HeldCandidateOutput } from "./dev-activation.types.js";
import type { DevLog, DevLogEvent } from "./dev.types.js";

/** Output events held for one reload before it is released to the log. */
const MAX_HELD_EVENTS = 500;
/** Standard error lines kept in a failure; the end of the output names the cause. */
const MAX_CAUSE_LINES = 40;
/** Milliseconds to wait for the exited process's output streams to close. */
const OUTPUT_GRACE_MS = 1_000;

/** A candidate process ended before its generation was verified. */
export class CandidateExitedError extends Data.TaggedError("CandidateExitedError")<{
  /** One-line summary naming the exit code; shown as the failure's first line. */
  readonly message: string;
  /** Native exit code of the candidate process. */
  readonly exitCode: number;
  /** The end of what the process wrote to standard error, project paths made relative. */
  readonly output: string;
}> {}

/**
 * Creates the output hold of one attempt; the initial start logs output as it arrives, because
 * its failure ends `relkit dev` and the output is the only evidence.
 * @param initial - Whether the attempt is the session's first generation.
 * @returns The hold.
 */
export function createHeldOutput(initial: boolean): HeldCandidateOutput {
  return { events: initial ? undefined : [], dropped: false };
}

/**
 * Logs an output event now, or holds it while the reload is unverified.
 * @param held - The attempt's hold.
 * @param log - Session log.
 * @param event - Projected candidate event.
 */
export function logCandidateEvent(
  held: HeldCandidateOutput,
  log: DevLog,
  event: DevLogEvent,
): void {
  if (event.event === "candidate.startup-output" && held.dropped) return;
  if (event.event !== "candidate.startup-output" || held.events === undefined) {
    log(event);
    return;
  }
  held.events.push(event);
  if (held.events.length >= MAX_HELD_EVENTS) releaseHeldOutput(held, log);
}

/**
 * Logs every held event and stops holding.
 * @param held - The attempt's hold.
 * @param log - Session log.
 */
export function releaseHeldOutput(held: HeldCandidateOutput, log: DevLog): void {
  const events = held.events ?? [];
  held.events = undefined;
  for (const event of events) log(event);
}

/**
 * Fails when the candidate exits before the surrounding verification completes; race it with
 * verification. An exit that follows supersession or shutdown is theirs to report.
 * @param attempt - Unpublished generation, its cancellation and its output hold.
 * @param candidate - Started process.
 * @returns An effect that never succeeds; it fails with the exit and its standard error.
 */
export const failOnCandidateExit = Effect.fn("Dev.activation.exit")(function* (
  attempt: DevActivationAttempt,
  candidate: StartedCandidate,
) {
  const exitCode = yield* Effect.promise(() => candidate.exited);
  if (attempt.signal.aborted) return yield* Effect.never;
  const output = yield* Effect.promise(() => candidate.output.catch(() => undefined)).pipe(
    Effect.timeoutOption(OUTPUT_GRACE_MS),
  );
  const stderr = output._tag === "Some" ? (output.value?.stderr ?? "") : "";
  // The cause is in the failure now; the held copy would repeat it as warnings.
  attempt.output.events = undefined;
  attempt.output.dropped = true;
  return yield* Effect.fail(
    cliAdapterError(
      "dev.candidate.exited",
      new CandidateExitedError({
        message: `The new version exited with code ${exitCode} before it was ready.`,
        exitCode,
        output: causeText(stderr, attempt.session.projectRoot),
      }),
    ),
  );
});

/**
 * Keeps the end of a process's standard error, with the project root removed from paths.
 * @param stderr - Retained standard error.
 * @param projectRoot - Application root.
 * @returns At most {@link MAX_CAUSE_LINES} non-empty trailing lines.
 */
function causeText(stderr: string, projectRoot: string): string {
  const prefix = projectRoot.endsWith("/") ? projectRoot : `${projectRoot}/`;
  return stderr
    .replaceAll(prefix, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .slice(-MAX_CAUSE_LINES)
    .join("\n");
}
