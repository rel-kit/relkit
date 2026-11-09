import type { TestHttpRequestInit } from "./http.types.js";

/**
 * Converts the test request options to a native `RequestInit`.
 * @param init - Caller options, possibly with the `json` body shorthand.
 * @returns Native options with the JSON body serialized, or the input when it has no `json`.
 * @throws TypeError when `json` and `body` are both supplied.
 */
export function toRequestInit(init: TestHttpRequestInit | undefined): RequestInit | undefined {
  if (init === undefined || init.json === undefined) return init;
  const { json, ...rest } = init;
  if (rest.body !== undefined && rest.body !== null)
    throw new TypeError("Test HTTP requests accept either json or body, not both");
  const headers = new Headers(rest.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return { ...rest, headers, body: JSON.stringify(json) };
}
