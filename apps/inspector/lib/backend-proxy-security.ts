import {
  inspectorAddressFromEnv,
  isOwnInspectorHost,
  type InspectorAddress,
} from "./backend-proxy-address";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Checks that a browser request was addressed to this Inspector and, for a method that changes
 * state, that it came from the Inspector's own pages. `Host` must name the address the Inspector
 * was started on, for every method: a DNS-rebinding page sends its own name there, so reading
 * inspection data through the route is refused too. Throws when the request is refused.
 */
export function secureApplicationProxyHeaders(
  request: Request,
  address: InspectorAddress = inspectorAddressFromEnv(process.env),
): Headers {
  const headers = new Headers(request.headers);
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (!isOwnInspectorHost(host, address)) {
    throw new Error("Application proxy only answers requests addressed to the Inspector.");
  }
  if (SAFE_METHODS.has(request.method)) return headers;
  const origin = headers.get("origin");
  const referer = headers.get("referer");
  const requestOrigin = origin ?? originOf(referer);
  if (requestOrigin !== `${new URL(request.url).protocol}//${host}`) {
    throw new Error("Application proxy requires an exact same-origin request.");
  }
  headers.delete("origin");
  headers.delete("referer");
  return headers;
}

function originOf(value: string | null): string | undefined {
  if (value === null) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}
