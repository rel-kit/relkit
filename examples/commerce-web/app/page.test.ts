import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { agentThreadIds, agentTransports, interruptQuestion } from "./agent-example-config";

test("agent examples own explicit thread IDs and selectable streaming transports", () => {
  expect(new Set(Object.values(agentThreadIds)).size).toBe(3);
  expect(
    Object.values(agentThreadIds).every((threadId) => threadId.startsWith("customer:demo:")),
  ).toBe(true);
  expect(agentTransports).toEqual(["sse", "websocket"]);
});

test("structured interrupts expose a readable question", () => {
  expect(interruptQuestion({ question: "Approve this order?", risk: "low" })).toBe(
    "Approve this order?",
  );
  expect(interruptQuestion(undefined)).toBe("Approve this order?");
});

test("announcements restore authoritative state around the live channel", async () => {
  const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  expect(source).toContain('useRoute("GET /announcements"');
  expect(source).toContain("onCaughtUp");
  expect(source).toContain("onGap");
  expect(source).toContain("await announcements.refetch()");
});

test("client contract mismatches are visible instead of silently idle", async () => {
  const source = await readFile(new URL("./providers.tsx", import.meta.url), "utf8");
  expect(source).toContain('status === "application-updated"');
  expect(source).toContain('role="alert"');
});
