/**
 * On Bun, the history store survives a record DuckDB refuses, a second Inspector, a killed worker
 * and an application outage, and says the truth about each (see the runner for the steps).
 */
import { expect, test } from "bun:test";
import { runHistorySurvival } from "../../../tests/fixtures/inspector/history-survival-run.js";
import { historySurvivalFailures } from "../../../tests/fixtures/inspector/history-survival-checks.js";

test("history survives a refused record, a second Inspector, a killed worker and an outage", async () => {
  const result = await runHistorySurvival();
  console.info("history survival", JSON.stringify(result));
  expect(historySurvivalFailures(result)).toEqual([]);
}, 300_000);
