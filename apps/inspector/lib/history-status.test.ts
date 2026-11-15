import { describe, expect, test } from "bun:test";
import {
  historyStatusMessage,
  missedLiveUpdatesNote,
  recordsLost,
  recordsLostSentence,
} from "./history-status";

describe("records lost before history (IN-17)", () => {
  test("reads the two named parts", () => {
    expect(
      recordsLost({
        recordsLostBeforeHistory: { byApplicationProducer: 42, byInspectionBuffer: 3 },
        dropped: 99,
        producerDropped: 99,
      }),
    ).toEqual({ total: 45, byApplicationProducer: 42, byInspectionBuffer: 3 });
  });

  test("falls back to the deprecated counters of an older Inspector", () => {
    expect(recordsLost({ dropped: 2, producerDropped: 4, producerFailed: 7 })).toEqual({
      total: 6,
      byApplicationProducer: 4,
      byInspectionBuffer: 2,
    });
    expect(recordsLost(undefined)).toBeUndefined();
  });

  test("says what the loss means and names both parts", () => {
    expect(recordsLostSentence({ total: 0, byApplicationProducer: 0, byInspectionBuffer: 0 })).toBe(
      undefined,
    );
    expect(
      recordsLostSentence({ total: 45, byApplicationProducer: 42, byInspectionBuffer: 3 }),
    ).toBe(
      "Some requests, logs or spans from this session are missing from history: the application could not hand 42 records to its inspection buffer, and the buffer dropped 3 before the Inspector stored them.",
    );
  });

  test("missed live updates are a quiet note, never a count of lost records", () => {
    expect(missedLiveUpdatesNote(0)).toBeUndefined();
    expect(missedLiveUpdatesNote(2229)).toBe(
      "Live updates were missed; the page refreshed. No record is lost.",
    );
  });

  test("the history message uses the same words", () => {
    const message = historyStatusMessage({
      state: "ready",
      incomplete: true,
      recordsLostBeforeHistory: { byApplicationProducer: 42, byInspectionBuffer: 0 },
    });
    expect(message).toContain("could not hand 42 records");
    expect(message).not.toContain("drops");
  });
});

test("history stays readable while the application is away", () => {
  expect(historyStatusMessage({ state: "ready", connection: "disconnected" })).toContain(
    "Retained history remains readable",
  );
  expect(historyStatusMessage({ state: "ready", connection: "ambiguous" })).toContain(
    "Retained history remains readable",
  );
});

test("storage failure recovery names the tool and preserves data", () => {
  expect(historyStatusMessage({ state: "degraded", error: "history.writer-conflict" })).toContain(
    "another Inspector writer",
  );
  expect(historyStatusMessage({ state: "degraded", error: "history.unavailable" })).toContain(
    "Restart the Inspector",
  );
  expect(historyStatusMessage(undefined)).toContain("unavailable");
});
