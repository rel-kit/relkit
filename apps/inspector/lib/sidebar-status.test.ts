import { describe, expect, test } from "bun:test";
import { sidebarStatus } from "./sidebar-status";
import { INITIAL_INSPECTOR_STATE, reduceInspectorState } from "./stream-application";

const connected = (collection: string) =>
  reduceInspectorState(
    reduceInspectorState(INITIAL_INSPECTOR_STATE, { type: "stream", state: "connected" }),
    {
      type: "status",
      at: "2026-11-15T10:00:00.000Z",
      body: {
        application: { state: "connected", sessionId: "s", generationId: "g" },
        collection,
      },
    },
  );

describe("the sidebar's health word (NF-13)", () => {
  test("says connected when history works", () => {
    expect(sidebarStatus(connected("connected"), false)).toBe("connected");
  });

  test("does not say connected while history cannot be read", () => {
    expect(sidebarStatus(connected("history-unavailable"), false)).toBe("history unavailable");
  });

  test("keeps the stream, the application and the graph first", () => {
    expect(sidebarStatus(INITIAL_INSPECTOR_STATE, false)).toBe("connecting");
    expect(sidebarStatus(connected("connected"), true)).toBe("offline");
  });
});
