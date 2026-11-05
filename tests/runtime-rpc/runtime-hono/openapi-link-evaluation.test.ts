/**
 * Task 23.1: evaluates oRPC's OpenAPI-based link (`@orpc/openapi-client` OpenAPILink) against
 * RelKit's real REST routes, one test per data kind the typed client must carry. Each test
 * records what OpenAPILink returns; design.md ("Decided while applying section 23") holds the
 * decision these results support.
 */
import { createORPCClient } from "@orpc/client";
import { oc } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createClient } from "@relkit/client";
import { expect, test } from "vitest";
import { wireKindsApp } from "./wire-kinds.fixture.ts";

const any = {
  "~standard": { version: 1 as const, vendor: "spike", validate: (value: unknown) => ({ value }) },
};
const contract = {
  date: oc.route({ method: "POST", path: "/kinds/date" }).input(any).output(any),
  integer: oc.route({ method: "POST", path: "/kinds/integer" }).input(any).output(any),
  file: oc.route({ method: "POST", path: "/kinds/file" }).input(any).output(any),
  stream: oc.route({ method: "GET", path: "/kinds/stream" }).input(any).output(any),
};

/**
 * Creates an OpenAPILink client over the app, recording each request and response.
 * @returns The client and the recorded exchanges.
 */
function openApiClient() {
  const app = wireKindsApp();
  const exchanges: { request: Request; response: Response }[] = [];
  const client = createORPCClient(
    new OpenAPILink(contract, {
      url: "http://relkit.test",
      fetch: async (request) => {
        const recorded = request.clone();
        const response = await app.fetch(request);
        exchanges.push({ request: recorded, response: response.clone() });
        return response;
      },
    }),
  ) as Record<keyof typeof contract, (input: unknown) => Promise<unknown>>;
  return { client, exchanges };
}

test("dates: OpenAPILink sends an ISO string and gets an ISO string back, not a Date", async () => {
  const { client, exchanges } = openApiClient();
  const output = await client.date({ at: new Date("2026-11-05T00:00:00.000Z") });
  expect(await exchanges[0]!.request.json()).toEqual({ at: "2026-11-05T00:00:00.000Z" });
  // JSON has no date type: the route sees a string and the caller gets a string.
  expect(output).toEqual({ received: "string", next: "2026-11-06T00:00:00.000Z" });
});

test("large integers: OpenAPILink sends a decimal string and the route answers it exactly", async () => {
  const { client, exchanges } = openApiClient();
  const output = await client.integer({ count: 9007199254740993n });
  expect(await exchanges[0]!.request.json()).toEqual({ count: "9007199254740993" });
  // REST writes a bigint output as a decimal string, so no digits are lost.
  expect(output).toEqual({ received: "string", next: "9007199254740994" });
});

test("files: OpenAPILink sends multipart form data that the route's multipart mapping reads", async () => {
  const { client, exchanges } = openApiClient();
  const output = await client.file({
    file: new File(["hello"], "hello.txt", { type: "text/plain" }),
    label: "greeting",
  });
  expect(exchanges[0]!.request.headers.get("content-type")).toMatch(/^multipart\/form-data/);
  expect(output).toEqual({ name: "hello.txt", text: "hello", label: "greeting" });
});

test("streams: OpenAPILink does not read RelKit's SSE events as stream items", async () => {
  const { client, exchanges } = openApiClient();
  const output = await client.stream({});
  const items: unknown[] = [];
  let failure: unknown;
  try {
    for await (const item of output as AsyncIterable<unknown>) items.push(item);
  } catch (error) {
    failure = error;
  }
  const body = await exchanges[0]!.response.text();
  expect(body).toContain("event: relkit-item");
  // OpenAPILink reads only oRPC's own event names (`message`, `error`, `done`), so it ends
  // the stream silently without any of the route's two items.
  expect(items).toEqual([]);
  expect(failure).toBeUndefined();
});

test("the typed client carries every data kind over the same REST routes", async () => {
  const app = wireKindsApp();
  const paths: string[] = [];
  const client = createClient({
    baseUrl: "http://relkit.test",
    fetch: Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(String(input), init);
        paths.push(`${request.method} ${new URL(request.url).pathname}`);
        return app.fetch(request);
      },
      { preconnect: () => undefined },
    ),
  }) as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  await expect(
    client["POST /kinds/date"]!({ at: new Date("2026-11-05T00:00:00.000Z") }),
  ).resolves.toEqual({
    received: "string",
    next: "2026-11-06T00:00:00.000Z",
  });
  await expect(client["POST /kinds/integer"]!({ count: 9007199254740993n })).resolves.toEqual({
    received: "string",
    next: "9007199254740994",
  });
  await expect(
    client["POST /kinds/file"]!({ file: new File(["hello"], "hello.txt"), label: "greeting" }),
  ).resolves.toEqual({ name: "hello.txt", text: "hello", label: "greeting" });
  const items: unknown[] = [];
  for await (const item of (await client["GET /kinds/stream"]!({})) as AsyncIterable<unknown>)
    items.push(item);
  expect(items).toEqual([{ tick: 1 }, { tick: 2 }]);
  expect(paths).toEqual([
    "GET /_relkit/v1/client/routes",
    "POST /kinds/date",
    "POST /kinds/integer",
    "POST /kinds/file",
    "GET /kinds/stream",
  ]);
});
