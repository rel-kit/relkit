import { expect, test } from "bun:test";
import { createRestLink } from "../src/rest-link.ts";
import { encodeRestRequest } from "../src/rest-request.ts";
import type { ClientRouteEntry } from "../src/rest-routes.types.ts";
import { mockFetch } from "./fixtures/fetch.ts";

const route = (entry: Partial<ClientRouteEntry>): ClientRouteEntry => ({
  id: "route",
  api: ["orders", "route"],
  method: "GET",
  path: "/",
  request: { kind: "input", fields: {} },
  stream: null,
  operation: "query",
  errors: [],
  ...entry,
});

test("a mapping sends each field where the server reads it", async () => {
  const { url, init } = encodeRestRequest(
    "http://relkit.test/api/",
    route({
      method: "POST",
      path: "/orders/:orderId/files/*parts",
      request: {
        kind: "input",
        fields: {
          orderId: {
            kind: "transform",
            transformId: "trim",
            value: { kind: "path", name: "orderId" },
          },
          parts: { kind: "path-segments", name: "parts" },
          dryRun: { kind: "optional", value: { kind: "query", name: "dry-run" } },
          email: { kind: "header", name: "x-customer-email" },
          quantity: { kind: "body", name: "quantity" },
          placedAt: { kind: "body", name: "placedAt" },
          amount: { kind: "body", name: "amount" },
          session: { kind: "cookie", name: "session" },
        },
      },
    }),
    {
      orderId: "o 1",
      parts: ["a", "b/c"],
      dryRun: true,
      email: "a@example.com",
      quantity: 2,
      placedAt: new Date("2026-11-05T00:00:00.000Z"),
      amount: 9007199254740993n,
      session: "ignored",
    },
    new Headers(),
  );
  expect(url.href).toBe("http://relkit.test/api/orders/o%201/files/a/b%2Fc?dry-run=true");
  expect(init.method).toBe("POST");
  const headers = init.headers as Headers;
  expect(headers.get("x-customer-email")).toBe("a@example.com");
  expect(headers.get("content-type")).toBe("application/json");
  expect(JSON.parse(String(init.body))).toEqual({
    quantity: 2,
    placedAt: "2026-11-05T00:00:00.000Z",
    amount: "9007199254740993",
  });
});

test("files go in a multipart body and an omitted optional catch-all leaves the path", () => {
  const file = new File(["hello"], "hello.txt", { type: "text/plain" });
  const { url, init } = encodeRestRequest(
    "http://relkit.test",
    route({
      method: "POST",
      path: "/uploads/*rest?",
      request: {
        kind: "input",
        fields: {
          rest: { kind: "optional", value: { kind: "path-segments", name: "rest" } },
          label: { kind: "multipart", name: "label" },
          attachments: { kind: "multipart-all", name: "attachments" },
        },
      },
    }),
    { label: "docs", attachments: [file, file] },
    new Headers(),
  );
  expect(url.pathname).toBe("/uploads");
  const form = init.body as FormData;
  expect(form.get("label")).toBe("docs");
  expect(form.getAll("attachments")).toHaveLength(2);
  expect((form.get("attachments") as File).name).toBe("hello.txt");
});

test("Problem Details become typed errors and SSE routes stream items", async () => {
  const routes = [
    route({
      id: "a",
      api: ["orders", "create"],
      method: "POST",
      path: "/orders",
      operation: "mutation",
    }),
    route({ id: "b", api: ["orders", "report"], path: "/report", stream: "sse" }),
  ];
  const link = createRestLink({
    baseUrl: "http://relkit.test",
    fetch: mockFetch(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === "/_relkit/v1/client/routes") return Response.json({ routes });
      if (url.pathname === "/orders")
        return Response.json(
          {
            status: 400,
            code: "validation-failed",
            detail: "Invalid input",
            issues: [{ message: "x" }],
          },
          { status: 400, headers: { "content-type": "application/problem+json" } },
        );
      return new Response(
        'event: relkit-item\ndata: {"n":1}\n\nevent: relkit-item\ndata: {"n":2}\n\nevent: relkit-complete\ndata: {"ok":true}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
    }),
  });
  expect(link.handles(["api", "orders", "create"])).toBe(true);
  expect(link.handles(["jobs", "fixture", "trigger"])).toBe(false);
  expect(link.handles(["relkit.agent.observe"])).toBe(false);
  const error = await link
    .call(["api", "orders", "create"], {}, {})
    .catch((cause: unknown) => cause);
  expect(error).toMatchObject({
    code: "BAD_REQUEST",
    status: 400,
    message: "Invalid input",
    data: { issues: [{ message: "x" }] },
  });
  const items: unknown[] = [];
  for await (const item of (await link.call(["GET /report"], {}, {})) as AsyncIterable<unknown>)
    items.push(item);
  expect(items).toEqual([{ n: 1 }, { n: 2 }]);
  const missing = await link
    .call(["api", "orders", "gone"], {}, {})
    .catch((cause: unknown) => cause);
  expect(missing).toMatchObject({ code: "NOT_FOUND", status: 404 });
});
