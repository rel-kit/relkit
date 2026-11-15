import type { TransportSecurityOptions } from "./transport-security.types.js";

/** Whether the application accepts this request as a trusted service call. A browser puts
 * `Origin`, `Referer` or a `Sec-Fetch-Site` other than `none` or `same-origin` on the requests it
 * sends, so a request carrying one is never a service call, whatever the callback says: it answers
 * to the origin rules.
 * @param request - Native request whose headers decide whether a browser could have sent it.
 * @param options - Transport-security options holding the application's trusted-service callback.
 * @returns True only for a request without browser headers that the callback accepts.
 */
export async function isTrustedServiceCall(
  request: Request,
  options: TransportSecurityOptions,
): Promise<boolean> {
  if (options.trustedService === undefined) return false;
  const { headers } = request;
  if (headers.has("origin") || headers.has("referer")) return false;
  const site = headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (site !== undefined && site !== "none" && site !== "same-origin") return false;
  return options.trustedService(request);
}
