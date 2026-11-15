/** Says who a request from the Inspector acted as: nobody, unless you supply an `Authorization` value (D11). */

/** Shown once beside the result of an invoke, publish, replay, retry or cancel. */
export const ACTION_SESSION_NOTE = "The Inspector ran this action without a user session.";

/**
 * Shown once beside the result of a route request from the composer.
 * @param headers - The headers that were sent.
 * @returns A sentence that names the `Authorization` value when the developer supplied one.
 */
export function routeSessionNote(headers: Headers | undefined): string {
  const authorization = headers?.get("authorization");
  return authorization === null || authorization === undefined || authorization === ""
    ? "This request was sent without a user session."
    : "This request was sent with the Authorization value you supplied.";
}
