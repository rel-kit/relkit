/** Verifies canonical AG-UI replay, observation ownership and cancellation against explicitly selected native transport fixtures. */
import { expect, test, afterEach } from "vitest";
import { EventType } from "@ag-ui/core";
import { createOperationId } from "@relkit/realtime";
import { AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_VALUE } from "@relkit/contracts";
import {
  protocolFixture,
  canonicalEvents,
  parseSse,
  disposeReplayFixtures,
} from "./agent-protocol-replay-fixture.js";
import { assertCanonicalFrames } from "./agent-protocol-replay-assertions.js";
afterEach(disposeReplayFixtures);
test("AG-UI preserves canonical state, nested, and custom events across cursor replay", async () => {
  let executions = 0;
  const fixture = await protocolFixture(async (request) => {
    executions += 1;
    const signal = request.signal ?? new AbortController().signal;
    for (const event of canonicalEvents()) {
      await (
        request.trigger as
          { readonly contentSink?: import("@relkit/agents").AgentContentSink } | undefined
      )?.contentSink?.emitEvent?.(event, signal);
    }
    return `reply:${String(request.input)}`;
  });
  const operationId = createOperationId();
  const initial = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: fixture.headers(operationId),
    body: fixture.body,
  });
  const frames = parseSse(await initial.text());
  assertCanonicalFrames(frames);
  const stateCursor = frames[1]?.id;
  expect(stateCursor).toEqual(expect.any(String));

  const replay = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: { ...fixture.headers(operationId), "last-event-id": stateCursor! },
    body: fixture.body,
  });
  const replayed = parseSse(await replay.text());
  expect(replayed.map(({ data }) => (data as { type: string }).type)).toEqual([
    EventType.CUSTOM,
    EventType.CUSTOM,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  expect(replayed.every(({ id }) => id === undefined || id !== stateCursor)).toBe(true);
  expect(executions).toBe(1);

  const invalid = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: { ...fixture.headers(createOperationId()), "last-event-id": "not-a-cursor" },
    body: fixture.body.replace("protocol-thread", "invalid-cursor-thread"),
  });
  expect(invalid.status).toBe(422);
  expect(executions).toBe(1);
});

test("cancelling the SSE iterator leaves detached execution running", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  let executionSignal: AbortSignal | undefined;
  const fixture = await protocolFixture(
    async (request) => {
      executionSignal = request.signal;
      started.resolve();
      await release.promise;
      return "done";
    },
    (provider) => ({
      ...provider,
      completeRun: async (request) => {
        const receipt = await provider.completeRun(request);
        completed.resolve();
        return receipt;
      },
    }),
  );
  const response = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: fixture.headers(createOperationId()),
    body: fixture.body,
  });
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("RUN_STARTED");
  await started.promise;
  await reader.cancel();
  expect(executionSignal?.aborted).toBe(false);
  release.resolve();
  await completed.promise;
  expect(executionSignal?.aborted).toBe(false);
});

test("observe-only AG-UI replays an existing run without accepting another execution", async () => {
  let executions = 0;
  const fixture = await protocolFixture(async (request) => {
    executions += 1;
    for (const event of canonicalEvents()) {
      await (
        request.trigger as
          { readonly contentSink?: import("@relkit/agents").AgentContentSink } | undefined
      )?.contentSink?.emitEvent?.(event, request.signal ?? new AbortController().signal);
    }
    return "done";
  });
  const initial = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: fixture.headers(createOperationId()),
    body: fixture.body,
  });
  const initialFrames = parseSse(await initial.text());
  const started = initialFrames[0]?.data as { runId: string };
  const cursor = initialFrames[1]?.id;
  const observed = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "last-event-id": cursor!,
      "x-relkit-agent-observe": "1",
      [AGENT_CAPABILITY_HEADER]: AGENT_CAPABILITY_VALUE,
      "x-relkit-identity-scope": "viewer",
      "x-relkit-session-epoch": "session",
    },
    body: JSON.stringify({ threadId: "protocol-thread", runId: started.runId }),
  });
  expect(observed.status).toBe(200);
  const frames = parseSse(await observed.text());
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.some(({ data }) => {
      if (typeof data !== "object" || data === null) return false;
      const metadata = (data as { metadata?: { relkit?: { observation?: object } } }).metadata;
      return metadata?.relkit?.observation !== undefined;
    }),
  ).toBe(true);
  expect(executions).toBe(1);
});
