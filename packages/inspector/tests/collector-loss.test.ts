/** Overflow diagnostics survive saturation, coalesce changed totals and retain stable durable receipt keys. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { lostKinds, persistCollectionLoss } from "../src/collector-loss.js";
import type { InspectorHistoryOperations } from "../src/history.types.js";

test("loss is persisted outside the application queue and only changed totals produce another diagnostic", async () => {
  const writes: { key: string; message: string }[] = [];
  const history: InspectorHistoryOperations = {
    call: (command) =>
      Effect.sync(() => {
        if (command.type === "append")
          for (const entry of command.records) {
            expect(entry.record.signal).toBe("diagnostic");
            if (entry.record.signal === "diagnostic")
              writes.push({ key: entry.key, message: entry.record.message });
          }
        return [];
      }),
  };
  const batch = {
    records: [],
    gap: true,
    droppedRecords: 2,
    droppedBytes: 1000,
    producerFailed: 3,
    producerDropped: 1,
    incomplete: true,
  };
  const key = await Effect.runPromise(persistCollectionLoss(history, batch, "session"));
  await Effect.runPromise(persistCollectionLoss(history, batch, "session", key));
  expect(writes).toHaveLength(1);
  expect(writes[0]?.message).toContain("2 retained records lost");
  expect(writes[0]?.message).toContain("3 producer failures");
  await Effect.runPromise(persistCollectionLoss(history, batch, "session"));
  expect(writes[1]?.key).toBe(writes[0]?.key);
  await Effect.runPromise(
    persistCollectionLoss(history, { ...batch, droppedRecords: 3 }, "session", key),
  );
  expect(writes[2]?.key).not.toBe(key);
});

test("the loss diagnostic names what the buffer gave up", async () => {
  const messages: string[] = [];
  const history: InspectorHistoryOperations = {
    call: (command) =>
      Effect.sync(() => {
        if (command.type === "append")
          for (const entry of command.records)
            if (entry.record.signal === "diagnostic") messages.push(entry.record.message);
        return [];
      }),
  };
  const batch = {
    records: [],
    gap: false,
    droppedRecords: 5,
    droppedBytes: 900,
    droppedByKind: { frameworkLogs: 4, logs: 1, spans: 0, requestEnds: 0 },
    incomplete: true,
  };
  await Effect.runPromise(persistCollectionLoss(history, batch, "session"));
  expect(messages[0]).toContain(
    "5 retained records lost (900 bytes: 4 framework success logs, 1 other logs)",
  );
  expect(lostKinds(undefined)).toBe("");
});
