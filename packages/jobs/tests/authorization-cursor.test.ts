import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import {
  createJobCursor,
  createJobCursorEffect,
  JobCursorFailure,
  readJobCursor,
  readJobCursorEffect,
} from "../src/authorization-cursor.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
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
test("Effect cursor operations report tagged failures and use the observer", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const cursor = await Effect.runPromise(
    Effect.provide(createJobCursorEffect(binding, { key: "test-secret" }), layer),
  );
  const verified = await Effect.runPromise(
    Effect.provide(
      readJobCursorEffect(cursor, { ...binding, position: null }, { key: "test-secret" }),
      layer,
    ),
  );
  expect(verified.position).toBe("native-1");
  expect(seen).toEqual(["authorization.createCursor", "authorization.readCursor"]);
  const invalid = await Effect.runPromise(
    Effect.result(
      readJobCursorEffect(
        cursor,
        { ...binding, scope: "tenant:two", position: null },
        { key: "test-secret" },
      ),
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(JobCursorFailure);
});
