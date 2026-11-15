import { expect, test } from "bun:test";
import { InspectorApiError, createInspectorApiClient } from "./api";

test("an application's Problem Details answer stays on the error", async () => {
  const client = createInspectorApiClient({
    baseUrl: "http://127.0.0.1:9999/_relkit/backend",
    fetch: async () =>
      new Response(
        JSON.stringify({
          type: "/errors/origin-denied",
          title: "Forbidden",
          status: 403,
          code: "origin-denied",
          detail: "Request origin is not allowed.",
        }),
        { status: 403, headers: { "content-type": "application/problem+json" } },
      ),
  });
  const error = await client.list("routes").then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(InspectorApiError);
  const failure = error as InspectorApiError;
  expect(failure.status).toBe(403);
  expect(failure.code).toBe("HTTP_403");
  expect(failure.body?.code).toBe("origin-denied");
});

test("a body without a code is not kept", async () => {
  const client = createInspectorApiClient({
    baseUrl: "http://127.0.0.1:9999/_relkit/backend",
    fetch: async () =>
      new Response(JSON.stringify({ error: "nope" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
  });
  const error = (await client.list("routes").then(
    () => undefined,
    (cause: unknown) => cause,
  )) as InspectorApiError;
  expect(error.body).toBeUndefined();
});
