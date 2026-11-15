/**
 * The Inspector is the boundary between a browser and the application's inspection bridge: it
 * refuses a change a page of another site asked for, and forwards what it accepts as its own
 * call, without the browser's provenance or the developer's application cookies.
 */
import { backendError } from "./backend-history.js";

/** Methods that read; every other method can change the application. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** `Sec-Fetch-Site` values of a request the Inspector's own page (or the developer) made. */
const OWN_SITE = new Set(["same-origin", "none"]);

/**
 * Refuses a state-changing request that a browser marked as sent from another origin. The
 * Inspector's UI server has already required the page's `Origin` (or `Referer`) to be its own;
 * this check holds even where an `Origin` is absent or was rewritten on the way.
 * @param request - Request the UI server forwarded to the tool.
 * @returns A 403 response for a cross-origin change, or undefined when the request may proceed.
 */
export function crossSiteRefusal(request: Request): Response | undefined {
  if (SAFE_METHODS.has(request.method)) return undefined;
  const site = request.headers.get("sec-fetch-site");
  if (site === null || OWN_SITE.has(site.trim().toLowerCase())) return undefined;
  return backendError("request.cross-site", 403, {
    message: "The Inspector refuses changes requested by a page of another site.",
  });
}

/** Headers that describe the browser or a proxy hop, never the Inspector's call. */
const BROWSER_HEADERS = [
  "origin",
  "referer",
  // The browser's cookies for the Inspector's host include the application's, since cookies
  // ignore the port; actions and route requests run without a user session (D11). The tool adds
  // its own anonymous identity cookies instead (`application-identity.ts`).
  "cookie",
  "forwarded",
  "x-real-ip",
  "x-relkit-inspector-token",
  "connection",
  "transfer-encoding",
];

/**
 * Copies a browser request's headers for the Inspector's own call to the application.
 * @param incoming - Headers the UI server forwarded.
 * @returns The headers without browser provenance (`Origin`, `Referer`, `Sec-Fetch-*`), proxy
 * forwarding headers, cookies or the UI's token; `Authorization`, content and action headers stay.
 */
export function inspectorCallHeaders(incoming: Headers): Headers {
  const headers = new Headers(incoming);
  for (const name of BROWSER_HEADERS) headers.delete(name);
  for (const name of [...headers.keys()])
    if (name.startsWith("sec-fetch-") || name.startsWith("x-forwarded-")) headers.delete(name);
  return headers;
}
