/** Proves collection admission, durability ordering and replay after lost acknowledgements. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import type { InspectionConnectionFile } from "@relkit/inspector-api/connection";
import { InspectionConnectionError, InspectionCapture } from "@relkit/inspector-api/connection";
import { collectInspectionBatch } from "../src/collector.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";
import type { InspectorHistoryOperations } from "../src/history.types.js";

const connection: InspectionConnectionFile = {
  path: "/private/session.json",
  descriptor: {
    protocol: 1,
    projectId: `sha256:${"a".repeat(64)}`,
    sessionId: "312b0cb1-81bb-4b99-81b7-5812a720782b",
    token: "a".repeat(43),
    endpoint: "http://127.0.0.1:43100",
    process: { pid: 1, startedAt: "2026-10-23T00:00:00.000Z" },
    createdAt: "2026-10-23T00:00:00.000Z",
  },
};
const record = {
  version: 2,
  signal: "log",
  timestamp: "2026-10-23T00:00:00.000Z",
  level: "info",
  component: "app",
  message: "record",
  fields: {},
};

/** Returns one finite valid network batch; app credentials remain inside the connection. */
function remote(events: string[], failAck: () => boolean): InspectorRemoteOperations {
  return {
    request: (_connection, path) =>
      Effect.gen(function* () {
        if (path === "/_relkit/bridge/v1/ack") {
          events.push("ack");
          if (failAck())
            return yield* new InspectionConnectionError({
              operation: "lost-ack",
              cause: new Error("lost response"),
            });
          return Response.json({ acknowledged: 1 });
        }
        return Response.json({
          records: [{ sequence: 1, record }],
          gap: false,
          droppedRecords: 0,
          incomplete: false,
        });
      }),
    json: (response) => Effect.promise(() => response.text()),
  };
}

test("replay preserves envelope keys and ACK happens after the commit receipt", async () => {
  const events: string[] = [];
  const keys: string[] = [];
  let loseAck = true;
  const history: InspectorHistoryOperations = {
    call: (command) =>
      Effect.sync(() => {
        if (command.type === "append") keys.push(...command.records.map((entry) => entry.key));
        events.push("commit");
        return [];
      }),
  };
  const transport = remote(events, () => loseAck);
  await expect(
    Effect.runPromise(collectInspectionBatch(transport, history, connection, 0)),
  ).rejects.toThrow();
  loseAck = false;
  expect(
    await Effect.runPromise(collectInspectionBatch(transport, history, connection, 0)),
  ).toMatchObject({ through: 1 });
  expect(events).toEqual(["commit", "ack", "commit", "ack"]);
  expect(new Set(keys)).toEqual(new Set([`${connection.descriptor.sessionId}:1`]));
});

test("failed persistence sends no acknowledgement and recovery commits the same replay key", async () => {
  const events: string[] = [];
  const keys: string[] = [];
  let failing = true;
  const history: InspectorHistoryOperations = {
    call: (command) => {
      if (failing)
        return Effect.fail(
          new InspectionConnectionError({ operation: "disk-full", cause: new Error("full") }),
        );
      return Effect.sync(() => {
        if (command.type === "append") keys.push(...command.records.map((entry) => entry.key));
        events.push("commit");
        return [];
      });
    },
  };
  await expect(
    Effect.runPromise(
      collectInspectionBatch(
        remote(events, () => false),
        history,
        connection,
        0,
      ),
    ),
  ).rejects.toThrow();
  expect(events).toEqual([]);
  failing = false;
  expect(
    await Effect.runPromise(
      collectInspectionBatch(
        remote(events, () => false),
        history,
        connection,
        0,
      ),
    ),
  ).toMatchObject({ through: 1 });
  expect(events).toEqual(["commit", "ack"]);
  expect(keys).toEqual([`${connection.descriptor.sessionId}:1`]);
});

test("an unsafe sequence cannot commit data or advance durable acknowledgement", async () => {
  const events: string[] = [];
  const transport = {
    ...remote(events, () => false),
    json: () =>
      Effect.succeed(
        JSON.stringify({
          records: [{ sequence: Number.MAX_SAFE_INTEGER + 1, record }],
          gap: false,
          droppedRecords: 0,
          incomplete: false,
        }),
      ),
  };
  const history: InspectorHistoryOperations = {
    call: () =>
      Effect.sync(() => {
        events.push("commit");
        return [];
      }),
  };
  await expect(
    Effect.runPromise(collectInspectionBatch(transport, history, connection, 0)),
  ).rejects.toThrow();
  expect(events).toEqual([]);
});

test("near-full multi-record pulls fit persistence envelopes and make progress without eviction", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      for (let i = 0; i < 256; i++)
        yield* capture.append({
          ...record,
          version: 2,
          signal: "log",
          level: "info",
          message: "x".repeat(4000),
        });
      let committed = 0;
      const history: InspectorHistoryOperations = {
        call: (command) =>
          Effect.sync(() => {
            if (command.type === "append") {
              expect(Buffer.byteLength(JSON.stringify(command.records))).toBeLessThanOrEqual(
                1_048_576,
              );
              committed += command.records.length;
            }
            return [];
          }),
      };
      const transport: InspectorRemoteOperations = {
        request: (_connection, path, options) =>
          capture.records(new Request(`http://localhost${path}`, options)),
        json: (response) => Effect.promise(() => response.text()),
      };
      let through = 0;
      for (let polls = 0; through < 256 && polls < 4; polls++)
        through = (yield* collectInspectionBatch(transport, history, connection, through)).through;
      expect(through).toBe(256);
      expect(committed).toBe(256);
      const final = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records?after=256"),
      );
      expect(yield* Effect.promise(() => final.json())).toMatchObject({
        records: [],
        droppedRecords: 0,
        incomplete: false,
      });
    }),
  );
});
