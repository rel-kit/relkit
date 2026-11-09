import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { createMutationOperations } from "../../src/react/mutation.service.ts";
import { createPendingOperations } from "../../src/react/pending.service.ts";
import {
  clearPendingOperations,
  digestPendingRequest,
  jobUnknownOutcome,
  matchesPendingRequest,
  pendingOperations,
  pendingRequest,
  rememberJobPending,
  updatePending,
} from "../../src/react/pending.ts";

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

  expect(String(metadata.operationId)).toBe("operation-1");
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

test("mutation submission forgets on success and settles failures before rethrowing", async () => {
  const pending = createPendingOperations({ memory: new Map(), storage: () => undefined });
  const mutations = createMutationOperations(pending);
  const seen: number[] = [];
  const submit = (operationId: string, execute: () => Promise<unknown>) =>
    mutations.submit(
      "scope",
      "job-trigger",
      "exports",
      { operationId },
      {},
      { operationId },
      () => {
        seen.push(pending.list("scope").length);
        return execute();
      },
    );
  expect(await submit("ok", async () => "receipt")).toBe("receipt");
  expect(pending.list("scope")).toHaveLength(0);
  const lost = { code: "transport-lost" };
  await expect(submit("lost", () => Promise.reject(lost))).rejects.toBe(lost);
  expect(pending.list("scope")).toMatchObject([{ operationId: "lost", state: "unknown" }]);
  const declared = new ORPCError("FORBIDDEN");
  await expect(submit("declared", () => Promise.reject(declared))).rejects.toBe(declared);
  expect(pending.list("scope").map((entry) => String(entry.operationId))).toEqual(["lost"]);
  const unknown = {
    data: {
      code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
      outcome: "unknown",
      operationId: "recover",
      idempotencyKey: "key-2",
      recovery: { action: "inspect-native" },
    },
  };
  await expect(submit("recover", () => Promise.reject(unknown))).rejects.toBe(unknown);
  expect(pending.list("scope").find((entry) => entry.operationId === "recover")).toMatchObject({
    state: "unknown",
    idempotencyKey: "key-2",
    recovery: { action: "inspect-native" },
  });
  expect(seen).toEqual([1, 1, 2, 2]);
});
