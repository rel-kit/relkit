/**
 * Points a test application's HTTP client at an already running server, so an application's HTTP
 * suite can run against its production build on any runtime. Requests without an `Origin` get the
 * server's own, as a browser on the app would send. Only `http` and `close` are available; members
 * that need the in-process application throw when read.
 */
import type { TestApplication } from "./application.types.js";
import type { TestHttpInput, TestHttpRequest } from "./http.types.js";

/** Members that only exist for an application running in the test process. */
const IN_PROCESS_MEMBERS = ["runtime", "clock", "fakes", "observability"] as const;

/** Environment variable that selects a running server for `createTestApplication`. */
export const TEST_SERVER_URL_VARIABLE = "RELKIT_TEST_SERVER_URL";

/**
 * Creates a test application whose HTTP client sends requests to a running server.
 * @param server - Origin of the running server, for example `http://127.0.0.1:3000`.
 * @returns A test application with `http` and a no-op `close`.
 */
export function serverTestApplication(server: string | URL): TestApplication {
  const origin = new URL(server);
  if (origin.protocol !== "http:" && origin.protocol !== "https:")
    throw new TypeError(`${TEST_SERVER_URL_VARIABLE} must be an http or https URL.`);
  const request: TestHttpRequest = (input, init) => {
    const target = targetRequest(origin, input, init);
    // Production servers reject unsafe requests without an Origin; a browser on the app sends one.
    if (!target.headers.has("origin")) target.headers.set("origin", origin.origin);
    return fetch(target);
  };
  const method =
    (verb: string): TestHttpRequest =>
    (input, init) =>
      request(input, { ...(init ?? {}), method: verb });
  const http = Object.freeze({
    request,
    get: method("GET"),
    post: method("POST"),
    put: method("PUT"),
    patch: method("PATCH"),
    delete: method("DELETE"),
    listen: () => Promise.reject(unavailable("http.listen")),
    close: async () => undefined,
  });
  const application = { http, close: async () => undefined };
  for (const member of IN_PROCESS_MEMBERS)
    Object.defineProperty(application, member, {
      enumerable: true,
      get: () => {
        throw unavailable(member);
      },
    });
  return Object.freeze(application) as unknown as TestApplication;
}

/**
 * Re-targets a test request at the server, keeping its path, query, method, headers and body.
 * @param origin - Server origin.
 * @param input - Path, URL or request as the test wrote it.
 * @param init - Request options.
 * @returns The request to send.
 */
function targetRequest(origin: URL, input: TestHttpInput, init: RequestInit | undefined): Request {
  if (input instanceof Request) {
    const source = new URL(input.url);
    const moved = new Request(new URL(source.pathname + source.search, origin).href, input);
    return init === undefined ? moved : new Request(moved, init);
  }
  const url = new URL(input.toString(), "http://relkit.test");
  return new Request(new URL(url.pathname + url.search, origin).href, init);
}

/**
 * Explains why an in-process member is missing.
 * @param member - Member the test read.
 * @returns The error to throw.
 */
function unavailable(member: string): Error {
  return new Error(
    `testApp.${member} needs the in-process application; it is unavailable while ${TEST_SERVER_URL_VARIABLE} points the tests at a running server.`,
  );
}
