import { expect, test } from "bun:test";
import { cancelWhileWaiting } from "./realtime-cancel-log.case.ts";

test("on Bun, a channel stream whose caller aborts while waiting ends without an error log", async () => {
  const outcome = await cancelWhileWaiting();
  expect(outcome.ended).toBe("done");
  expect(outcome.logs.filter((log) => log.level === "Error")).toEqual([]);
});
