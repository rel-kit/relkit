import { expect, test } from "bun:test";
import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_VALUE,
  type AgentObservation,
  type JournalCheckpoint,
} from "@relkit/contracts";
import { createAgentSseClient } from "./src/react/agent-sse-client.ts";
import { ORPCError } from "./src/index.ts";

test("SSE adapter preserves identity, cursor, cancellation, and canonical observations", async () => {
  const checkpoint = point("4");
  const observation: AgentObservation = {
    kind: "event",
    event: {
      eventId: "event-5",
      recordId: "record-5",
      runId: "run-1",
      checkpoint: point("5"),
      createdAt: "2026-01-01T00:00:00.000Z",
      kind: "execution-event",
      value: {
        nativeSequence: 5,
        kind: "values",
        scope: [],
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  let request: Request | undefined;
  let cancelled = false;
  const client = createAgentSseClient({
    baseUrl: "http://relkit.test",
    credentials: "include",
    headers: { authorization: "Bearer token", "x-relkit-identity-scope": "viewer" },
    fetch: async (input, init) => {
      request = new Request(input, init);
      const payload = `data: ${JSON.stringify({ type: "CUSTOM", name: "relkit.execution", metadata: { relkit: { observation } } })}\r\n\r\n`;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(payload.slice(0, 31)));
            controller.enqueue(new TextEncoder().encode(payload.slice(31)));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    },
  }) as Record<string, (input: unknown, call: unknown) => Promise<AsyncIterable<AgentObservation>>>;
  const controller = new AbortController();
  const stream = await client["relkit.agent.observe"]!(
    { agentId: "support.echo", threadId: "thread-1", runId: "run-1", after: checkpoint },
    { signal: controller.signal },
  );
  const iterator = stream[Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({ done: false, value: observation });
  controller.abort();
  await iterator.return?.();
  expect(request?.headers.get("authorization")).toBe("Bearer token");
  expect(request?.headers.get("x-relkit-agent-observe")).toBe("1");
  expect(request?.headers.get(AGENT_CAPABILITY_HEADER)).toBe(AGENT_CAPABILITY_VALUE);
  expect(request?.headers.get("last-event-id")).toBe(
    encodeURIComponent(JSON.stringify(checkpoint)),
  );
  expect(await request?.json()).toEqual({ threadId: "thread-1", runId: "run-1" });
  expect(cancelled).toBe(true);
});

test("SSE adapter exposes HTTP failures as permanent RPC errors", async () => {
  const client = createAgentSseClient({
    baseUrl: "http://relkit.test",
    credentials: "include",
    fetch: async () =>
      Response.json(
        { error: { id: "IDENTITY_PRECONDITION_FAILED", message: "Identity changed." } },
        { status: 409 },
      ),
  }) as Record<string, (input: unknown) => Promise<unknown>>;
  const failure = client["relkit.agent.observe"]!({
    agentId: "support.echo",
    threadId: "thread-1",
    runId: "run-1",
    after: point("4"),
  });
  await expect(failure).rejects.toBeInstanceOf(ORPCError);
  await expect(failure).rejects.toHaveProperty("code", "IDENTITY_PRECONDITION_FAILED");
});

function point(sequence: string): JournalCheckpoint {
  return {
    applicationId: "fixture",
    environment: "test",
    profile: "default",
    providerEpoch: "epoch-1",
    threadId: "thread-1",
    sequence,
  };
}
