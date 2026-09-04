import { expect, test } from "bun:test";
import { captureRedacted, createRedactionPolicy, redactRecord } from "./src/index.ts";

const secrets = {
  password: "super-secret-password",
  authorization: "Bearer top-secret-token",
  cookie: "session=secret-cookie",
  OPENAI_API_KEY: "sk-secret",
};

test("admits deterministic secret-safe records and bounded development capture", () => {
  const record = redactRecord({
    traceId: "trace-1",
    environment: { PORT: "3000", ...secrets },
    headers: { Authorization: secrets.authorization, Cookie: secrets.cookie },
    requestBody: { email: "person@example.test", ...secrets },
    prompt: { messages: [{ content: "password=super-secret-password" }] },
    binary: new Uint8Array([1, 2, 3]),
  });
  expect(record).toEqual({ traceId: "trace-1" });
  expect(Object.isFrozen(record)).toBe(true);

  const capture = captureRedacted(
    { prompt: { token: "top-secret-token", question: "status?" } },
    createRedactionPolicy({ mode: "development-redacted", maxBytes: 200 }),
  );
  expect(capture?.content).toEqual({ prompt: { question: "status?", token: "[REDACTED]" } });
  expect(JSON.stringify(capture)).not.toContain("top-secret-token");
  expect(capture?.truncated).toBe(false);
});

test("truncates capture before admission when the byte bound is exceeded", () => {
  const capture = captureRedacted(
    { body: { value: "x".repeat(100) } },
    { mode: "development-redacted", maxBytes: 16 },
  );
  expect(capture).toEqual({ mode: "development-redacted", bytes: 16, truncated: true });
});

test("records an explicitly captured undefined result without inventing a value", () => {
  expect(captureRedacted(undefined, { mode: "development-redacted", maxBytes: 16 })).toEqual({
    mode: "development-redacted",
    bytes: 0,
    truncated: false,
  });
});

test("keeps request bodies off by default and redacted when explicitly captured", () => {
  const request = {
    method: "POST",
    headers: { authorization: "Bearer top-secret-token" },
    cookies: { session: "secret-cookie" },
    body: { email: "person@example.test", password: "super-secret-password" },
  };

  expect(redactRecord(request)).toEqual({ method: "POST" });
  const capture = captureRedacted(
    request,
    createRedactionPolicy({ mode: "development-redacted", maxBytes: 512 }),
  );
  expect(capture?.content).toEqual({
    body: { email: "person@example.test", password: "[REDACTED]" },
    cookies: "[REDACTED]",
    headers: { authorization: "[REDACTED]" },
    method: "POST",
  });
  expect(JSON.stringify(capture)).not.toContain("top-secret-token");
});

test("keeps service context out of default records while allowing bounded capture", () => {
  const value = { service: { principal: "user-1", tenant: "tenant-1", token: "secret" } };
  expect(redactRecord(value)).toEqual("[REDACTED]");
  const capture = captureRedacted(value, {
    mode: "development-redacted",
    maxBytes: 256,
  });
  expect(capture?.content).toEqual({
    service: { principal: "user-1", tenant: "tenant-1", token: "[REDACTED]" },
  });
});
