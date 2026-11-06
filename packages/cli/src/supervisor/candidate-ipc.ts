/**
 * Routes IPC messages from candidate servers to the callers waiting on them. Candidates are
 * spawned with the runtime adapter's IPC channel, whose handler calls `dispatchCandidateMessage`;
 * the dev reload path sends a request with `requestCandidate` and waits for the matching reply.
 * Waiters are keyed by the subprocess, so replies from a retired generation never reach a
 * request addressed to its successor, and a timed-out or cancelled wait removes itself.
 */
import type { CandidateMessage, CandidateReplyMatcher } from "./candidate-ipc.types.js";
export type { CandidateMessage, CandidateReplyMatcher } from "./candidate-ipc.types.js";

const waiters = new WeakMap<object, Set<(message: CandidateMessage) => boolean>>();

/**
 * Delivers one message from a candidate to the first waiter that accepts it.
 * @param subprocess - Candidate process that sent the message.
 * @param message - Deserialized message.
 */
export function dispatchCandidateMessage(subprocess: object, message: CandidateMessage): void {
  for (const waiter of waiters.get(subprocess) ?? []) if (waiter(message)) return;
}

/**
 * Sends a message to a candidate and waits for the reply the matcher accepts.
 * @typeParam Reply - Accepted reply shape.
 * @param subprocess - Candidate process with an IPC channel.
 * @param message - Request to send.
 * @param matches - Recognizes the reply.
 * @param timeoutMs - Milliseconds before the wait rejects.
 * @param signal - Cancels the wait.
 * @returns The accepted reply.
 */
export function requestCandidate<Reply extends CandidateMessage>(
  subprocess: { send: (message: CandidateMessage) => void },
  message: CandidateMessage,
  matches: CandidateReplyMatcher<Reply>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const registered = waiters.get(subprocess) ?? new Set();
    waiters.set(subprocess, registered);
    const finish = () => {
      registered.delete(waiter);
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const waiter = (reply: CandidateMessage) => {
      if (!matches(reply)) return false;
      finish();
      resolve(reply);
      return true;
    };
    const abort = () => {
      finish();
      reject(signal?.reason ?? new Error("Candidate request was cancelled."));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error(`Candidate did not reply within ${timeoutMs} ms.`));
    }, timeoutMs);
    registered.add(waiter);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      subprocess.send(message);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
