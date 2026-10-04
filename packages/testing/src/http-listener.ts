import type {
  RealListenerPurpose,
  TestHttpListenerOptions,
  TestHttpListener,
} from "./http-listener.types.js";
export type {
  RealListenerPurpose,
  TestHttpListenerOptions,
  TestHttpListener,
} from "./http-listener.types.js";
import type { TestHttpApplication, TestHttpInput, TestHttpRequest } from "./http.js";

/**
 * Starts the real-socket path reserved for disconnect, streaming, and proxy tests.
 * @param app - Native in-memory application request/fetch boundary.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns A native listener handle whose idempotent close releases the server.
 */
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

/** @inheritDoc createTestHttpListener */
export const createBunHttpListener = createTestHttpListener;

/**
 * Invokes the available native application request/fetch boundary.
 * @param app - Native in-memory application request/fetch boundary.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @returns The original native response or Promise.
 */
function dispatchFetch(app: TestHttpApplication, request: Request): Response | Promise<Response> {
  if (app.fetch !== undefined) return app.fetch(request);
  if (app.request !== undefined) return app.request(request);
  throw new TypeError("Test HTTP application must expose request() or fetch()");
}

/**
 * Normalizes a native request input against the configured base URL.
 * @param input - Declared input passed through the owning schema authority.
 * @param init - Caller-native request options.
 * @param baseUrl - Explicit origin for relative test requests.
 * @returns A Request retaining caller options and existing Request semantics.
 */
function makeRequest(input: TestHttpInput, init: RequestInit | undefined, baseUrl: URL): Request {
  if (input instanceof Request) return init === undefined ? input : new Request(input, init);
  const url = input instanceof URL ? new URL(input) : new URL(input, baseUrl);
  return new Request(url.toString(), init);
}

/**
 * Closes the real Bun listener, forcing stop only after its explicit deadline.
 * @param server - Native server supplied to this workflow.
 * @param timeoutMs - Explicit close deadline in milliseconds.
 * @returns Completion or the established listener deadline error.
 */
async function stopServer(server: Bun.Server<undefined>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopping = server.stop();
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  let completed: boolean;
  try {
    completed = await Promise.race([stopping.then(() => true), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (completed) return;
  await server.stop(true);
  throw new Error(`HTTP listener close exceeded ${String(timeoutMs)}ms`);
}

/**
 * Validates the real listener close deadline before opening a socket.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns Nothing for a safe non-negative duration.
 */
function validateTimeout(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError("closeTimeoutMs must be non-negative");
}
