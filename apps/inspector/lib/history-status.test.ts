import { expect, test } from "bun:test";
import { historyStatusMessage } from "./history-status";

test("history status discloses gaps and independent producer loss", () => {
  const message = historyStatusMessage({
    state: "ready",
    connection: "connected",
    incomplete: true,
    dropped: 2,
    producerFailed: 3,
    producerDropped: 4,
  });
  expect(message).toContain("Incomplete history");
  expect(message).toContain("2 capture drops");
  expect(message).toContain("3 producer failures");
  expect(message).toContain("4 producer drops");
});

test("disconnected and ambiguous sessions preserve readable history", () => {
  expect(historyStatusMessage({ state: "ready", connection: "disconnected" })).toContain(
    "Retained history remains readable",
  );
  expect(historyStatusMessage({ state: "ready", connection: "ambiguous" })).toContain(
    "Select a connection file",
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
