/** Message shapes on the IPC channel between `relkit dev` and its candidate servers. */
import type { JsonValue } from "relkit/contracts";

/** Any structured-clone message exchanged with a candidate. */
export type CandidateMessage = JsonValue;

/**
 * Recognizes the reply to one request.
 * @typeParam Reply - Accepted reply shape.
 * @param message - Message received from the candidate.
 * @returns Whether it is the awaited reply.
 */
export type CandidateReplyMatcher<Reply extends CandidateMessage> = (
  message: CandidateMessage,
) => message is Reply;
