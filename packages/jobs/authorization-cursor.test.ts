import { expect, test } from "bun:test";
import { createJobCursor, readJobCursor } from "./src/authorization-cursor.ts";

const binding = {
  application: "commerce",
  environment: "test",
  scope: "tenant:one",
  subject: "user:one",
  jobId: "orders.export",
  operation: "list" as const,
  filters: { status: ["completed"] },
  schema: "sha256:public",
  position: "native-1",
};

test("signs and verifies bounded job cursors", () => {
  const cursor = createJobCursor(binding, { key: "test-secret", keyId: "v1" });
  expect(
    readJobCursor(cursor, { ...binding, position: null }, { key: "test-secret", keyId: "v1" })
      .position,
  ).toBe("native-1");
  expect(() =>
    readJobCursor(
      cursor.slice(0, -1) + "A",
      { ...binding, position: null },
      { key: "test-secret", keyId: "v1" },
    ),
  ).toThrow();
  expect(() =>
    readJobCursor(
      cursor,
      { ...binding, scope: "tenant:two", position: null },
      { key: "test-secret", keyId: "v1" },
    ),
  ).toThrow();
});

test("does not accept signed cursors without the signing key", () => {
  const cursor = createJobCursor(binding, { key: "test-secret" });
  expect(() => readJobCursor(cursor, { ...binding, position: null })).toThrow();
});
