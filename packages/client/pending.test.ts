import { expect, test } from "bun:test";
import {
  clearPendingOperations,
  digestPendingRequest,
  jobUnknownOutcome,
  matchesPendingRequest,
  pendingOperations,
  pendingRequest,
  rememberJobPending,
  updatePending,
} from "./src/react/pending.ts";

test("job pending metadata matches the transmitted request and retains input only in memory", async () => {
  const scope = `pending-test-${crypto.randomUUID()}`;
  const request = {
    input: { accountId: "account-1" },
    options: { operationId: "operation-1", idempotencyKey: "key-1" },
  };
  const metadata = await rememberJobPending(scope, "exports", request, {
    operationId: "operation-1",
    idempotencyKey: "key-1",
  });

  expect(metadata.operationId).toBe("operation-1");
  expect(metadata.idempotencyKey).toBe("key-1");
  expect(metadata.requestDigest).toBe(await digestPendingRequest(request));
  expect(pendingRequest(scope, "operation-1")).toBe(request);
  expect(await matchesPendingRequest(scope, "operation-1", request)).toBe(true);
  expect(
    await matchesPendingRequest(scope, "operation-1", {
      ...request,
      input: { accountId: "other" },
    }),
  ).toBe(false);

  const unknown = jobUnknownOutcome({
    data: {
      code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
      outcome: "unknown",
      operationId: "operation-1",
      idempotencyKey: "key-1",
      recovery: { action: "retry-with-same-key", expiresAt: "2026-01-01T00:05:00.000Z" },
    },
  });
  expect(unknown?.recovery.action).toBe("retry-with-same-key");
  updatePending(scope, { ...metadata, state: "unknown", recovery: unknown!.recovery });
  expect(pendingOperations(scope)[0]?.state).toBe("unknown");
  clearPendingOperations(scope);
});

test("job pending tracking rejects a 101st intent without evicting unresolved entries", async () => {
  const scope = `pending-capacity-${crypto.randomUUID()}`;
  for (let index = 0; index < 100; index += 1) {
    await rememberJobPending(scope, "exports", { index }, { operationId: `operation-${index}` });
  }
  await expect(
    rememberJobPending(scope, "exports", { index: 100 }, { operationId: "operation-100" }),
  ).rejects.toMatchObject({ code: "RELKIT_PENDING_CAPACITY" });
  expect(pendingOperations(scope)).toHaveLength(100);
  clearPendingOperations(scope);
});

test("unknown job intents require an active same-key recovery window before reuse", async () => {
  const scope = `pending-recovery-${crypto.randomUUID()}`;
  const request = { input: { accountId: "account-1" }, options: { idempotencyKey: "key-1" } };
  const metadata = await rememberJobPending(scope, "exports", request, {
    operationId: "operation-1",
    idempotencyKey: "key-1",
  });

  updatePending(scope, { ...metadata, state: "unknown", recovery: { action: "inspect-native" } });
  await expect(
    rememberJobPending(scope, "exports", request, {
      operationId: "operation-1",
      idempotencyKey: "key-1",
    }),
  ).rejects.toMatchObject({ code: "RELKIT_PENDING_RECOVERY_UNAVAILABLE" });

  updatePending(scope, {
    ...metadata,
    state: "unknown",
    recovery: {
      action: "retry-with-same-key",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  await expect(
    rememberJobPending(scope, "exports", request, {
      operationId: "operation-1",
      idempotencyKey: "key-1",
    }),
  ).resolves.toMatchObject({ state: "submitted" });

  updatePending(scope, {
    ...metadata,
    state: "unknown",
    recovery: { action: "retry-with-same-key", expiresAt: new Date(Date.now() - 1).toISOString() },
  });
  await expect(
    rememberJobPending(scope, "exports", request, {
      operationId: "operation-1",
      idempotencyKey: "key-1",
    }),
  ).rejects.toMatchObject({ code: "RELKIT_PENDING_RECOVERY_UNAVAILABLE" });
  clearPendingOperations(scope);
});
