import { describe, expect, test } from "bun:test";
import { itemsForJob, runCounts } from "./jobs-model";

describe("inspector job projections", () => {
  test("keeps per-job run counts", () => {
    const items = [
      { jobId: "orders.send", runId: "one", status: "running" },
      { jobId: "orders.send", runId: "two", status: "failed" },
      { jobId: "other.job", runId: "three", status: "completed" },
    ];
    const selected = itemsForJob(items, "orders.send", ["orders.send", "other.job"]);
    expect(selected).toHaveLength(2);
    expect(runCounts(selected)).toMatchObject({ running: 1, failed: 1, completed: 0 });
  });
});
