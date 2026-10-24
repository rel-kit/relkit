/** Verifies the real dev bridge has session lifetime independently of backend generations. */
import { expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { startDev } from "./src/commands/dev.js";
import type { DevSession } from "./src/commands/dev-session.js";
import {
  makeRoot,
  options,
  waitFor,
  adoptSession,
  registerDevCleanup,
} from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

/** Reads the authenticated live session using server-only metadata. */
async function handshake(session: DevSession) {
  const descriptor = session.inspectionConnection!.descriptor;
  return fetch(`${descriptor.endpoint}/v1/handshake`, {
    headers: {
      authorization: `Bearer ${descriptor.token}`,
      "x-relkit-project-id": descriptor.projectId,
      "x-relkit-session-id": descriptor.sessionId,
    },
  }).then((response) => response.json());
}

test("disabled dev serves business routes without inspection files or a UI child", async () => {
  const root = await makeRoot();
  const session = await startDev(options(root, "sha256:disabled-bridge"));
  await adoptSession(session);
  expect(await (await fetch(`http://127.0.0.1:${session.backendPort}/hello`)).text()).toBe("hello");
  expect(session.inspectionConnection).toBeUndefined();
  expect(
    await access(join(root, ".relkit/connections")).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});

test("reload preserves descriptor identity, rejects failed candidates, and restart rotates credentials", async () => {
  const root = await makeRoot();
  let fail = false;
  const base = options(root, "sha256:session-bridge");
  const config = {
    ...base,
    inspector: { host: "127.0.0.1", port: 0 },
    compile: async (request: Parameters<typeof base.compile>[0]) => {
      if (fail) throw new Error("rejected candidate");
      return base.compile(request);
    },
  };
  const session = await startDev(config);
  await adoptSession(session);
  await waitFor(() => session.inspectionConnection !== undefined);
  const original = session.inspectionConnection!;
  expect(await handshake(session)).toMatchObject({ generationId: "generation-1" });
  fail = true;
  expect(await session.activate(1)).toBe(false);
  expect(await handshake(session)).toMatchObject({ generationId: "generation-1" });
  fail = false;
  expect(await session.activate(2)).toBe(true);
  expect(await handshake(session)).toMatchObject({ generationId: "generation-3" });
  expect(session.inspectionConnection).toEqual(original);
  await session.stop();
  expect(
    await access(original.path).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  expect(
    await fetch(original.descriptor.endpoint).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  const restarted = await startDev(config);
  await adoptSession(restarted);
  await waitFor(() => restarted.inspectionConnection !== undefined);
  expect(restarted.inspectionConnection!.descriptor.token).not.toBe(original.descriptor.token);
  expect(restarted.inspectionConnection!.descriptor.sessionId).not.toBe(
    original.descriptor.sessionId,
  );
});

test("bridge bind failure leaves the verified backend serving", async () => {
  const root = await makeRoot();
  const occupied = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const events: string[] = [];
  try {
    const session = await startDev({
      ...options(root, "sha256:bridge-bind"),
      inspector: { host: "127.0.0.1", port: occupied.port! },
      onLog: (event) => events.push(event.event),
    });
    await adoptSession(session);
    await waitFor(() => events.includes("dev.inspector.failed"));
    expect(await (await fetch(`http://127.0.0.1:${session.backendPort}/hello`)).text()).toBe(
      "hello",
    );
    expect(session.inspectionConnection).toBeUndefined();
  } finally {
    await occupied.stop(true);
  }
});
