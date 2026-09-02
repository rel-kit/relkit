import { canonicalJson, type JsonValue } from "@relkit/contracts";

export type OtlpSignal = "logs" | "traces";

export interface OtlpTransportOptions {
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetch?: typeof globalThis.fetch;
}

export interface OtlpTransport {
  readonly send: (signal: OtlpSignal, payload: JsonValue, abort?: AbortSignal) => Promise<void>;
  readonly flush: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export function createOtlpTransport(options: OtlpTransportOptions): OtlpTransport {
  const endpoint = parseEndpoint(options.endpoint);
  const fetcher = options.fetch ?? globalThis.fetch;
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  let closed = false;
  return Object.freeze({
    send: async (signal: OtlpSignal, payload: JsonValue, abort?: AbortSignal) => {
      if (closed) throw new Error("OTLP transport is closed");
      if (signal !== "logs" && signal !== "traces") throw new TypeError("OTLP signal is invalid");
      const response = await fetcher(signalUrl(endpoint, signal), {
        method: "POST",
        headers,
        body: canonicalJson(payload),
        ...(abort === undefined ? {} : { signal: abort }),
      });
      if (!response.ok) {
        const detail = (await response.text()).trim().replace(/\s+/g, " ").slice(0, 500);
        throw new Error(
          `OTLP ${signal} export failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
        );
      }
    },
    flush: () => Promise.resolve(),
    close: () => {
      closed = true;
      return Promise.resolve();
    },
  });
}

function parseEndpoint(value: string): URL {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError("OTLP endpoint must be non-empty text");
  const endpoint = new URL(value);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:")
    throw new TypeError("OTLP endpoint must use http or https");
  return endpoint;
}

function signalUrl(endpoint: URL, signal: OtlpSignal): string {
  const target = new URL(endpoint);
  if (/\/v1\/(?:logs|traces)\/?$/.test(target.pathname))
    target.pathname = target.pathname.replace(/\/v1\/(?:logs|traces)\/?$/, `/v1/${signal}`);
  else target.pathname = `${target.pathname.replace(/\/$/, "")}/v1/${signal}`;
  return target.toString();
}
