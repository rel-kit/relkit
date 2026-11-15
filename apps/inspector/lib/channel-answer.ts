import { STALE_GENERATION_TEXT } from "./action-answer";
import { schemaTemplate } from "./schema-model";

/** The text a channel's params box starts with: its declared required parameters, filled in. */
export function channelParamsText(paramsSchema: unknown): string {
  return JSON.stringify(schemaTemplate(paramsSchema), null, 2);
}

/**
 * Puts a failed channel connection into words. The Inspector connects to the application as an
 * anonymous visitor of its own, without this browser's cookies or any user session, and the
 * application answers a denied subscribe call as `NOT_FOUND` so that it does not confirm that the
 * channel exists.
 * @param cause - The failure thrown by the application client.
 * @returns A sentence for the page.
 */
export function channelFailure(cause: unknown): string {
  const code = cause instanceof Error ? (cause as { code?: unknown }).code : undefined;
  if (code === "NOT_FOUND")
    return "The application refused or concealed this channel. The Inspector connects as an anonymous visitor without a user session, so a channel that needs a signed-in user answers as if it did not exist.";
  if (code === "UNAUTHORIZED")
    return "The application refused this connection: no session is attached. The Inspector connects as an anonymous visitor and never sends a user session, so it cannot open channels that need a signed-in user.";
  // The application's bare "Conflict" (409) is its answer to a call made for a generation that a
  // reload has replaced; any longer message says something specific and is kept.
  if (cause instanceof Error && cause.message === "Conflict") return STALE_GENERATION_TEXT;
  return cause instanceof Error && cause.message !== ""
    ? cause.message
    : "Channel operation failed.";
}
