import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestApplication } from "../../src/application.js";
import { serverTestApplication } from "../../src/application-server.js";

const received: { method: string; url: string; body: string; origin?: string | undefined }[] = [];
const server = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk: Buffer) => (body += chunk.toString()));
  request.on("end", () => {
    received.push({
      method: request.method ?? "",
      url: request.url ?? "",
      body,
      origin: request.headers.origin,
    });
    response.writeHead(201, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
});
let origin = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

test("RELKIT_TEST_SERVER_URL sends HTTP tests to the running server", async () => {
  process.env.RELKIT_TEST_SERVER_URL = origin;
  try {
    const app = await createTestApplication({ env: {} });
    const response = await app.http.request("/orders?x=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku: "book" }),
    });
    expect([response.status, await response.json()]).toEqual([201, { ok: true }]);
    await app.http.get(new Request("http://relkit.test/hello?name=Ada"));
    await app.close();
  } finally {
    delete process.env.RELKIT_TEST_SERVER_URL;
  }
  expect(received).toEqual([
    { method: "POST", url: "/orders?x=1", body: '{"sku":"book"}', origin },
    { method: "GET", url: "/hello?name=Ada", body: "", origin },
  ]);
});

test("members that need the in-process application explain why they are missing", async () => {
  const app = serverTestApplication(origin);
  expect(() => app.runtime).toThrow(/needs the in-process application/);
  await expect(app.http.listen()).rejects.toThrow(/http.listen needs the in-process application/);
  expect(() => serverTestApplication("ftp://example.test")).toThrow(/http or https/);
});
