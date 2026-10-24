/** Keeps valid early request snapshots distinct from completed function correlation. */
import { expect, test } from "bun:test";
import { Schema } from "effect";
import { requestDetailSchema } from "./product-runtime.fixture.js";

test("request detail fixtures decode both unbound and completed snapshots", () => {
  const started = { request: { requestId: "request" }, spans: [] };
  expect(Schema.decodeUnknownSync(requestDetailSchema)(started)).toEqual(started);
  const completed = {
    request: { requestId: "request", functionId: "orders.get" },
    spans: [{ functionId: "orders.get", status: "completed" }],
  };
  expect(Schema.decodeUnknownSync(requestDetailSchema)(completed)).toEqual(completed);
});
