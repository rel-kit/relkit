import { expect, test } from "bun:test";
import { resolveBackendUrl } from "./backend-url";

test("joins a same-origin proxy prefix without treating it as an absolute URL", () => {
  expect(resolveBackendUrl("/_zsys/backend", "/_zsys/v1/graph")).toBe(
    "/_zsys/backend/_zsys/v1/graph",
  );
});

test("joins absolute backend URLs", () => {
  expect(resolveBackendUrl("http://127.0.0.1:3212/_zsys/backend", "/_zsys/v1/graph")).toBe(
    "http://127.0.0.1:3212/_zsys/backend/_zsys/v1/graph",
  );
});
