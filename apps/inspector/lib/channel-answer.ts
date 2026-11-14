import { schemaTemplate } from "./schema-model";

/** The text a channel's params box starts with: its declared required parameters, filled in. */
export function channelParamsText(paramsSchema: unknown): string {
  return JSON.stringify(schemaTemplate(paramsSchema), null, 2);
}

/**
 * Puts a failed channel connection into words. The browser connects straight to the application
 * with this browser's session, and the application answers a denied subscription as `NOT_FOUND`
 * so that it does not confirm that the channel exists.
 * @param cause - The failure thrown by the application client.
 * @returns A sentence for the page.
 */
export function channelFailure(cause: unknown): string {
  const code = cause instanceof Error ? (cause as { code?: unknown }).code : undefined;
  if (code === "NOT_FOUND")
    return "The application refused or concealed this channel. The Inspector connects with this browser's session for the application's origin, and there is none unless you are signed in to the application in this browser.";
  if (code === "UNAUTHORIZED")
    return "The application refused this connection: no session is attached. The Inspector connects with this browser's session for the application's origin, so sign in to the application in this browser first.";
  return cause instanceof Error && cause.message !== ""
    ? cause.message
    : "Channel operation failed.";
}
