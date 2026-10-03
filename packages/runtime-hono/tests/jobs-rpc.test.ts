import { createFixtureClient, createFixtureWebSocketClient } from "./fixture-client.js";
import { afterEach, expect, test } from "vitest";

import { startBunFixture, type BunFixture } from "./bun-fixture.ts";
const servers: BunFixture[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});
test("uses one projected jobs router for HTTP and WebSocket", async () => {
  const server = await startBunFixture("jobs-rpc");
  servers.push(server);
  const state = async (): Promise<{ submittedInput: unknown; nativeListCursor: unknown }> =>
    (await fetch(`http://127.0.0.1:${server.port}/__fixture/state`)).json() as Promise<{
      submittedInput: unknown;
      nativeListCursor: unknown;
    }>;
  const identity = { identityScope: "viewer", sessionEpoch: "session" };
  const client = createFixtureClient({
    baseUrl: `http://127.0.0.1:${server.port}`,
    headers: {
      "x-relkit-jobs-protocol": "1",
      "x-relkit-public-fingerprint": "sha256:jobs",
    },
  });

  const accepted = await client.jobs.exportOrders.trigger({
    input: "7",
    expectedIdentity: identity,
  });
  expect(accepted).toMatchObject({ accepted: true, runId: "run-1", jobId: "orders.export" });
  expect((await state()).submittedInput).toBe(7);
  expect(
    await client.jobs.exportOrders.runs.get({ runId: "run-1", expectedIdentity: identity }),
  ).toEqual(
    expect.objectContaining({ input: 7, output: { url: "https://example.test/export.csv" } }),
  );
  const page = await client.jobs.exportOrders.runs.list({
    expectedIdentity: identity,
    query: { limit: 1 },
  });
  expect(page.items[0]).toEqual(expect.objectContaining({ input: 7, progress: { completed: 1 } }));
  expect(page.items[0]).not.toHaveProperty("scope");
  expect(page.nextCursor).toEqual(expect.any(String));
  await client.jobs.exportOrders.runs.list({
    expectedIdentity: identity,
    query: { limit: 1, cursor: page.nextCursor },
  });
  expect((await state()).nativeListCursor).toBe("native-1");

  const socketClient = createFixtureWebSocketClient({
    baseUrl: `http://127.0.0.1:${server.port}`,
    headers: { "x-relkit-jobs-protocol": "1", "x-relkit-public-fingerprint": "sha256:jobs" },
  });
  const socketAccepted = await socketClient.jobs.exportOrders.trigger({
    input: "8",
    expectedIdentity: identity,
  });
  expect(socketAccepted).toMatchObject({ accepted: true, runId: "run-1" });
  expect((await state()).submittedInput).toBe(8);
  const socketRun = await socketClient.jobs.exportOrders.runs.get({
    runId: "run-1",
    expectedIdentity: identity,
  });
  expect(socketRun).toMatchObject({ runId: "run-1", status: "completed" });

  const staleSocket = createFixtureWebSocketClient({
    baseUrl: `http://127.0.0.1:${server.port}`,
    headers: { "x-relkit-jobs-protocol": "1", "x-relkit-public-fingerprint": "sha256:old" },
  });
  await expect(
    staleSocket.jobs.exportOrders.runs.get({ runId: "run-1", expectedIdentity: identity }),
  ).rejects.toMatchObject({
    code: "RELKIT_JOB_PUBLIC_CONTRACT_STALE",
  });

  const stale = createFixtureClient({
    baseUrl: `http://127.0.0.1:${server.port}`,
    headers: { "x-relkit-jobs-protocol": "1", "x-relkit-public-fingerprint": "sha256:old" },
  });
  await expect(
    stale.jobs.exportOrders.runs.get({ runId: "run-1", expectedIdentity: identity }),
  ).rejects.toMatchObject({
    code: "RELKIT_JOB_PUBLIC_CONTRACT_STALE",
  });
  await expect(
    client.jobs.hiddenJob.trigger({ input: "7", expectedIdentity: identity }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
