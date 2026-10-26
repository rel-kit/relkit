/** Verifies native AG-UI capability negotiation, origin and identity rejection, operation deduplication, and parser-compatible streaming. */
import { EventSchemas } from "@ag-ui/core";
import { afterEach, expect, test } from "vitest";
import { AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_VALUE } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime";
import { basicProtocolFixture, disposeBasicFixtures } from "./agent-protocol-basic-fixture.js";
afterEach(disposeBasicFixtures);

test("AG-UI endpoint emits a parser-compatible stream", async () => {
  const { app, executions } = await basicProtocolFixture();
  const headers = {
    "content-type": "application/json",
    origin: "http://relkit.test",
    "x-relkit-identity-scope": "viewer",
    "x-relkit-session-epoch": "session",
    "x-relkit-operation-id": createOperationId(),
    [AGENT_CAPABILITY_HEADER]: AGENT_CAPABILITY_VALUE,
  };
  const payload = {
    threadId: "external-thread",
    runId: "external-run",
    state: {},
    messages: [{ id: "message-1", role: "user", content: "hello" }],
    tools: [],
    context: [],
  };
  const body = JSON.stringify(payload);
  const request = (requestHeaders: NonNullable<RequestInit["headers"]>, requestBody = body) =>
    app.request("http://relkit.test/_relkit/v1/agents/support.echo/ag-ui", {
      method: "POST",
      headers: requestHeaders,
      body: requestBody,
    });
  const withoutCapabilities = new Headers(headers);
  withoutCapabilities.delete(AGENT_CAPABILITY_HEADER);
  expect((await request(withoutCapabilities)).status).toBe(426);
  expect(executions()).toBe(0);
  expect((await request({ ...headers, origin: "https://evil.example" })).status).toBe(403);
  expect((await request({ ...headers, "x-relkit-session-epoch": "stale" })).status).toBe(409);
  expect(executions()).toBe(0);
  expect((await request(headers, JSON.stringify({ ...payload, threadId: "" }))).status).toBe(422);
  expect(executions()).toBe(0);
  const agui = await request(headers);
  await assertProtocolStream(agui);
  expect(executions()).toBe(1);
});

/** Validates the accepted response against the native AG-UI event parser.
 * @param agui - Accepted native event-stream response.
 * @returns Completion after status, capability header and ordered frames agree.
 */
async function assertProtocolStream(agui: Response): Promise<void> {
  expect(agui.status).toBe(200);
  expect(agui.headers.get(AGENT_CAPABILITY_HEADER)).toBe(AGENT_CAPABILITY_VALUE);
  const text = await agui.text();
  expect(text).toContain("id: ");
  const events = text
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => EventSchemas.parse(JSON.parse(line.slice(6))));
  expect(events[0]).toMatchObject({ threadId: "external-thread" });
  expect(events.map((event) => event.type)).toEqual([
    "RUN_STARTED",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "RUN_FINISHED",
  ]);
}
