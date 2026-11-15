import { describe, expect, test } from "bun:test";
import {
  historyFailed,
  historyIncomplete,
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

describe("the tool's collection state says an application outage apart from a history failure", () => {
  const outage = {
    state: "ready",
    collection: "application-unreachable",
    connection: "disconnected",
  };

  test("an unreachable application leaves retained history intact", () => {
    const status = { ...outage, applicationError: "connect.failed" };
    expect(historyStatusMessage(status)).toBe(
      "The application is unreachable. Retained history is intact.",
    );
    expect(historyFailed(status)).toBe(false);
  });

  test("an error beside collection does not make the outage a history failure", () => {
    expect(historyFailed({ ...outage, error: "connect.failed" })).toBe(false);
    expect(historyStatusMessage({ ...outage, error: "connect.failed" })).not.toMatch(/degraded/i);
  });

  test("waiting and invalid applications have their own words", () => {
    expect(historyStatusMessage({ state: "ready", collection: "waiting-for-application" })).toBe(
      "Waiting for the application to connect. Retained history is readable.",
    );
    expect(historyStatusMessage({ state: "ready", collection: "application-invalid" })).toBe(
      "The application sent records the Inspector could not accept. Retained history is intact.",
    );
  });

  test("a collecting tool keeps the connected sentence", () => {
    expect(historyStatusMessage({ state: "ready", collection: "collecting" })).toContain(
      "History collection connected",
    );
  });

  test("a history failure is still degraded", () => {
    const failed = { state: "degraded", collection: "history-unavailable", error: "history.open" };
    expect(historyFailed(failed)).toBe(true);
    expect(historyStatusMessage(failed)).toContain("History collection unavailable");
    expect(historyFailed({ collection: "history-unavailable" })).toBe(true);
  });

  test("an older tool without collection reads degraded and error as before", () => {
    expect(historyFailed({ state: "degraded" })).toBe(true);
    expect(historyFailed({ state: "ready", error: "connect.failed" })).toBe(true);
    expect(historyFailed({ state: "ready" })).toBe(false);
  });

  test("an outage still reports the records that never reached history", () => {
    const message = historyStatusMessage({
      ...outage,
      incomplete: true,
      recordsLostBeforeHistory: { byApplicationProducer: 0, byInspectionBuffer: 4 },
    });
    expect(message).toContain("The application is unreachable. Retained history is intact.");
    expect(message).toContain("the buffer dropped 4");
  });
});

describe("nothing is missing when no record was lost (NF-9, NF-11)", () => {
  const none = { byApplicationProducer: 0, byInspectionBuffer: 0 };

  test("a zero loss says nothing is missing, whatever the flag", () => {
    for (const connection of ["connected", "disconnected", "ambiguous"]) {
      const message = historyStatusMessage({
        state: "ready",
        connection,
        incomplete: true,
        recordsLostBeforeHistory: none,
      });
      expect(message).not.toMatch(/missing|incomplete|could not hand|cannot be reconstructed/i);
    }
    expect(historyIncomplete({ incomplete: true, recordsLostBeforeHistory: none })).toBe(false);
  });

  test("an incomplete history with no counts, or with a loss, is still incomplete", () => {
    expect(historyIncomplete({ incomplete: true })).toBe(true);
    expect(
      historyIncomplete({
        incomplete: true,
        recordsLostBeforeHistory: { byApplicationProducer: 0, byInspectionBuffer: 4 },
      }),
    ).toBe(true);
    expect(historyIncomplete({ incomplete: false })).toBe(false);
    expect(historyIncomplete(undefined)).toBe(false);
  });

  test("a part that lost nothing is not named as a failure", () => {
    const sentence = recordsLostSentence({
      total: 4,
      byApplicationProducer: 0,
      byInspectionBuffer: 4,
    });
    expect(sentence).toBe(
      "Some requests, logs or spans from this session are missing from history: the buffer dropped 4 before the Inspector stored them.",
    );
    expect(recordsLostSentence({ total: 5, byApplicationProducer: 5, byInspectionBuffer: 0 })).toBe(
      "Some requests, logs or spans from this session are missing from history: the application could not hand 5 records to its inspection buffer.",
    );
  });
});
