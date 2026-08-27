import { expect, test } from "bun:test";
import { resolveBackendUrl } from "./backend-url";

test("joins a same-origin proxy prefix without treating it as an absolute URL", () => {
  expect(resolveBackendUrl("/_relkit/backend", "/_relkit/v1/graph")).toBe(
    "/_relkit/backend/_relkit/v1/graph",
  );
});

test("joins absolute backend URLs", () => {
  expect(resolveBackendUrl("http://127.0.0.1:3212/_relkit/backend", "/_relkit/v1/graph")).toBe(
    "http://127.0.0.1:3212/_relkit/backend/_relkit/v1/graph",
  );
});
