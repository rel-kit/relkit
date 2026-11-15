/**
 * Every Problem the framework answers carries `X-Content-Type-Options: nosniff` and
 * `Cache-Control: no-store`, whether a route ran or the answer was sent before one could.
 */
import { expect, test } from "vitest";
import { EARLY_RESPONSE_LIMIT, earlyResponseHandler } from "./early-response-app.ts";

const handler = earlyResponseHandler();
const origin = "http://localhost";

/** Asserts the response is a Problem with the shared safe headers. */
function expectProblemDefaults(response: Response, status: number): void {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("no-store");
}

test("an unmatched path's 404 carries the defaults", async () => {
  expectProblemDefaults(await handler(new Request(`${origin}/nope`)), 404);
});

test("a wrong method's 405 carries the defaults and keeps Allow", async () => {
  const response = await handler(
    new Request(`${origin}/ok`, { method: "DELETE", headers: { origin } }),
  );
  expectProblemDefaults(response, 405);
  expect(response.headers.get("allow")).toContain("GET");
});

test("a body over the limit's 413 carries the defaults", async () => {
  const body = "x".repeat(EARLY_RESPONSE_LIMIT * 2);
  const response = await handler(
    new Request(`${origin}/echo`, { method: "POST", body, headers: { origin } }),
  );
  expectProblemDefaults(response, 413);
});

test("an error a route answers carries the defaults", async () => {
  const response = await handler(
    new Request(`${origin}/private`, { method: "POST", headers: { origin } }),
  );
  expectProblemDefaults(response, 401);
});

test("a not-ready answer carries the defaults", async () => {
  expectProblemDefaults(await handler(new Request(`${origin}/not-ready`)), 503);
});
