/**
 * Labels generation events so a reader of the event stream, such as the Inspector's generation
 * history, can tell sessions and kinds of change apart: every `dev.generation.*` event carries
 * `runId`, the identifier of the `relkit dev` session that emitted it (stable for the lifetime of
 * the process, new after the command restarts), and `reason`, why the generation changed.
 * Versions restart at 0 in every session, so the version alone cannot tell two sessions' first
 * generations apart. The field is not named after the session: log redaction removes every key
 * containing "session", and the Inspector's session identifier is not reused for the same reason.
 */
import type { DevGenerationReason } from "./dev-activation.types.js";
import type { DevSession } from "./dev-session.js";
import type { DevLog } from "./dev.types.js";

/** One run identifier per development session object, created on its first generation event. */
const runIds = new WeakMap<DevSession, string>();

/**
 * Builds the identity fields of one generation event.
 * @param session - Emitting session.
 * @param reason - Why the generation changed.
 * @returns `runId` and `reason`.
 */
export function generationIdentity(session: DevSession, reason: DevGenerationReason) {
  let runId = runIds.get(session);
  if (runId === undefined) {
    runId = crypto.randomUUID();
    runIds.set(session, runId);
  }
  return { runId, reason };
}

/**
 * Wraps the session log for the in-process reload: its `dev.generation.*` events gain the run
 * identifier and the reason `reload`; other events pass through unchanged.
 * @param session - Emitting session.
 * @returns The labelled log.
 */
export function reloadGenerationLog(session: DevSession): DevLog {
  return (event) => {
    if (!event.event.startsWith("dev.generation.")) {
      session.log(event);
      return;
    }
    session.log({
      ...event,
      fields: { ...event.fields, ...generationIdentity(session, "reload") },
    });
  };
}
