/** Checks canonical native SDK frames without changing replay admission or cursor ownership. */
import { expect } from "vitest";
import { EventSchemas, EventType } from "@ag-ui/core";
import { AGENT_STREAM_VERSION } from "@relkit/contracts";
import type { parseSse } from "./agent-protocol-replay-fixture.js";
/** Validates root and nested projections with the native event discriminator.
 * @param frames - Original native stream records, in delivery order.
 * @returns Nothing; assertions reject missing metadata or changed frame ordering.
 */
export function assertCanonicalFrames(frames: ReturnType<typeof parseSse>) {
  expect(frames.map(({ data }) => EventSchemas.parse(data).type)).toEqual([
    EventType.RUN_STARTED,
    EventType.STATE_SNAPSHOT,
    EventType.CUSTOM,
    EventType.CUSTOM,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  expect(frames[1]?.data).toMatchObject({
    type: EventType.STATE_SNAPSHOT,
    snapshot: { todos: [{ content: "Inspect", status: "in_progress" }] },
    metadata: {
      relkit: {
        protocol: "relkit.agent-event",
        version: AGENT_STREAM_VERSION,
        eventId: expect.any(String),
        recordId: expect.any(String),
        runId: expect.any(String),
        kind: "values",
      },
    },
  });
  expect(frames[2]?.data).toMatchObject({
    type: EventType.CUSTOM,
    name: "relkit.execution",
    value: { kind: "tasks", scope: ["tools:delegate"], agent: "researcher" },
  });
  expect(frames[3]?.data).toMatchObject({
    type: EventType.CUSTOM,
    name: "orders.notice",
    value: { kind: "custom", value: { name: "orders.notice", status: "ready" } },
  });
}
