import { describe, expect, test } from "bun:test";
import { itemsForJob, nextRunValue, queueCounts } from "./jobs-model";

describe("inspector job projections", () => {
  test("keeps per-job queue counts and safe next-run metadata", () => {
    const items = [
      { jobId: "orders.send", instanceId: "one", state: "available" },
      { jobId: "orders.send", instanceId: "two", state: "dead-lettered" },
      { jobId: "other.job", instanceId: "three", state: "completed" },
    ];
    const selected = itemsForJob(items, "orders.send", ["orders.send", "other.job"]);
    expect(selected).toHaveLength(2);
    expect(queueCounts(selected)).toMatchObject({ available: 1, "dead-lettered": 1 });
    expect(
      nextRunValue(
        { schedule: [{ id: "hourly" }] },
        [{ schedules: [{ id: "hourly", nextRunAt: 1_700_000_000_000 }] }],
        "hourly",
      ),
    ).toBe(1_700_000_000_000);
  });
});
