/** On Node, 1,260 sequential mixed requests each leave exactly one complete record in history. */
import { expect, test } from "vitest";
import { runHistoryLoad } from "../../../tests/fixtures/inspector/load-run.js";

test("every request of a sequential burst has one complete record in history", async () => {
  expect(process.versions.bun).toBeUndefined();
  const result = await runHistoryLoad(1260);
  console.info("history load", process.versions.bun ? "bun" : "node", JSON.stringify(result));
  expect(result.unexpectedStatus).toBe(0);
  expect(result).toMatchObject({
    missing: {},
    inProgress: {},
    wrongStatus: {},
    duplicates: 0,
    recordsLostBeforeHistory: { byApplicationProducer: 0, byInspectionBuffer: 0 },
  });
  expect(result.outcomes["unmatched-404"]).toEqual({ refused: 180 });
  expect(result.outcomes["method-405"]).toEqual({ refused: 180 });
  expect(result.outcomes["item-409"]).toEqual({ "declared-error": 180 });
}, 300_000);
