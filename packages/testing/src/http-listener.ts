import type { TestHttpApplication, TestHttpInput, TestHttpRequest } from "./http.js";

export type RealListenerPurpose = "disconnect" | "stream" | "proxy";

export interface TestHttpListenerOptions {
  readonly purpose?: RealListenerPurpose;
  readonly hostname?: string;
  readonly port?: number;
  readonly idleTimeout?: number;
  readonly closeTimeoutMs?: number;
}

export interface TestHttpListener {
  readonly purpose: RealListenerPurpose;
  readonly url: URL;
  readonly server: Bun.Server<undefined>;
  readonly request: TestHttpRequest;
  readonly close: () => Promise<void>;
}

/** Starts the real-socket path reserved for disconnect, streaming, and proxy tests. */
export async function createTestHttpListener(
  app: TestHttpApplication,
  options: TestHttpListenerOptions = {},
): Promise<TestHttpListener> {
  const purpose = options.purpose ?? "disconnect";
  const closeTimeoutMs = options.closeTimeoutMs ?? 1_000;
  validateTimeout(closeTimeoutMs);
  const server = Bun.serve({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 0,
    ...(options.idleTimeout === undefined ? {} : { idleTimeout: options.idleTimeout }),
    fetch: (request) => dispatchFetch(app, request),
  });
  let closing: Promise<void> | undefined;
  const request: TestHttpRequest = (input, init) =>
    globalThis.fetch(makeRequest(input, init, server.url));
  const close = (): Promise<void> => {
    if (closing !== undefined) return closing;
    closing = stopServer(server, closeTimeoutMs);
    return closing;
  };
  return Object.freeze({ purpose, url: server.url, server, request, close });
}

export const createBunHttpListener = createTestHttpListener;

function dispatchFetch(app: TestHttpApplication, request: Request): Response | Promise<Response> {
  if (app.fetch !== undefined) return app.fetch(request);
  if (app.request !== undefined) return app.request(request);
  throw new TypeError("Test HTTP application must expose request() or fetch()");
}
function makeRequest(input: TestHttpInput, init: RequestInit | undefined, baseUrl: URL): Request {
  if (input instanceof Request) return init === undefined ? input : new Request(input, init);
  const url = input instanceof URL ? new URL(input) : new URL(input, baseUrl);
  return new Request(url.toString(), init);
}
async function stopServer(server: Bun.Server<undefined>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopping = server.stop();
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const completed = await Promise.race([stopping.then(() => true), timeout]);
  if (timer !== undefined) clearTimeout(timer);
  if (completed) return;
  await server.stop(true);
  throw new Error(`HTTP listener close exceeded ${String(timeoutMs)}ms`);
}
function validateTimeout(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError("closeTimeoutMs must be non-negative");
}
