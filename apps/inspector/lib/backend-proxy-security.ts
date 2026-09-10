const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function secureApplicationProxyHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  if (SAFE_METHODS.has(request.method)) return headers;
  const incomingOrigin = publicRequestOrigin(request);
  const origin = headers.get("origin");
  const referer = headers.get("referer");
  const requestOrigin = origin ?? originOf(referer);
  if (requestOrigin !== incomingOrigin) {
    throw new Error("Application proxy requires an exact same-origin request.");
  }
  headers.delete("origin");
  headers.delete("referer");
  return headers;
}

function publicRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  return host === null ? url.origin : `${url.protocol}//${host}`;
}

function originOf(value: string | null): string | undefined {
  if (value === null) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}
