/**
 * The Inspector's own anonymous identity with the application. The application gives a client
 * without a session an anonymous identity through cookies its identity endpoint sets, and checks
 * on later calls (a channel subscribe, for one) that the client presents the same identity. The
 * tool forwards none of the browser's cookies, so it keeps the cookies that endpoint sets in its
 * own jar and sends them back on its later calls. Only that endpoint's cookies are kept: a
 * session cookie set by any other call, such as a sign-in sent from the route composer, is not.
 *
 * The jar lives as long as the tool process and is shared by its browser tabs, so every page of
 * one Inspector is one anonymous visitor, and an identity the application issued stays valid
 * across reloads of a page and restarts of the application.
 */

/**
 * Path of the application's client identity document; `CLIENT_IDENTITY_PATH` of
 * `relkit/runtime-hono`, repeated here so the tool does not load the HTTP runtime.
 */
export const CLIENT_IDENTITY_PATH = "/_relkit/v1/client/identity";

/** Cookies the tool keeps per project, at most. */
const MAX_COOKIES = 16;
/** Longest cookie value the tool keeps. */
const MAX_VALUE = 4096;
const NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const VALUE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;

/** The tool's cookies for the applications it calls. */
export interface ApplicationIdentityJar {
  /**
   * @param projectId - Project of the application called.
   * @returns The `Cookie` header for a call to it, or undefined when the jar holds none.
   */
  readonly cookie: (projectId: string) => string | undefined;
  /**
   * Keeps the cookies an identity response set: a new value replaces the old one, and an
   * expired cookie (`Max-Age=0` or a past `Expires`) is removed.
   * @param projectId - Project of the application that answered.
   * @param setCookies - The response's `Set-Cookie` values.
   */
  readonly keep: (projectId: string, setCookies: readonly string[]) => void;
}

/**
 * Creates an empty jar for one tool process.
 * @returns The jar.
 */
export function makeApplicationIdentityJar(): ApplicationIdentityJar {
  const projects = new Map<string, Map<string, string>>();
  return {
    cookie: (projectId) => {
      const cookies = projects.get(projectId);
      if (cookies === undefined || cookies.size === 0) return undefined;
      return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    keep: (projectId, setCookies) => {
      const cookies = projects.get(projectId) ?? new Map<string, string>();
      for (const line of setCookies) {
        const parsed = parseSetCookie(line);
        if (parsed === undefined) continue;
        if (parsed.expired) cookies.delete(parsed.name);
        else if (cookies.has(parsed.name) || cookies.size < MAX_COOKIES)
          cookies.set(parsed.name, parsed.value);
      }
      projects.set(projectId, cookies);
    },
  };
}

/** Reads a cookie's name, value and whether it is expired; undefined when it is malformed. */
function parseSetCookie(
  line: string,
): { readonly name: string; readonly value: string; readonly expired: boolean } | undefined {
  const [pair = "", ...attributes] = line.split(";");
  const equals = pair.indexOf("=");
  if (equals < 1) return undefined;
  const name = pair.slice(0, equals).trim();
  let value = pair.slice(equals + 1).trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!NAME.test(name) || !VALUE.test(value) || value.length > MAX_VALUE) return undefined;
  let expired = false;
  for (const attribute of attributes) {
    const [key = "", ...rest] = attribute.split("=");
    const setting = rest.join("=").trim();
    if (key.trim().toLowerCase() === "max-age") expired = Number(setting) <= 0;
    else if (key.trim().toLowerCase() === "expires" && Date.parse(setting) <= Date.now())
      expired = true;
  }
  return { name, value, expired };
}
