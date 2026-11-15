/** NF-13 (pages): unreadable history is said, never an endless skeleton or an empty list. */
import { describe, expect, test } from "bun:test";
import { createInspectorApiClient, InspectorApiError } from "./api";
import { HISTORY_UNAVAILABLE_TEXT, isHistoryUnavailable } from "./history-status";
import { emptySignalText } from "./signal-empty";

describe("a failed history query", () => {
  test("is recognised by the tool's 503", () => {
    expect(isHistoryUnavailable(new InspectorApiError("x", "History unavailable", 503))).toBe(true);
    expect(isHistoryUnavailable(new InspectorApiError("x", "history.unavailable", 503))).toBe(true);
    expect(isHistoryUnavailable(new InspectorApiError("x", "HTTP_503", 503))).toBe(false);
    expect(isHistoryUnavailable(new InspectorApiError("x", "History unavailable", 400))).toBe(
      false,
    );
    expect(isHistoryUnavailable(new Error("History unavailable"))).toBe(false);
  });

  test("is asked once, not for 15 seconds", async () => {
    let asked = 0;
    const client = createInspectorApiClient({
      cacheTtlMs: 0,
      fetch: async () => {
        asked += 1;
        return Response.json(
          { protocol: "relkit.inspector", version: 1, error: "History unavailable" },
          { status: 503 },
        );
      },
    });
    const error = await client.request("/_relkit/v1/requests/request-1").catch((cause) => cause);
    expect(isHistoryUnavailable(error)).toBe(true);
    expect(asked).toBe(1);
  });
});

describe("the function page's recent traces and logs", () => {
  test("say history is unavailable, not that none are retained", () => {
    expect(emptySignalText("trace", true)).toBe(HISTORY_UNAVAILABLE_TEXT);
    expect(emptySignalText("log", true)).toBe(HISTORY_UNAVAILABLE_TEXT);
  });

  test("still say none are retained when history works", () => {
    expect(emptySignalText("trace", false)).toBe("No correlated traces are retained.");
    expect(emptySignalText("log", false)).toBe("No correlated logs are retained.");
  });
});
