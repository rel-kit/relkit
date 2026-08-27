import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobAdmin } from "./src/jobs/admin.ts";
import { createJobQueue } from "./src/jobs/queue.ts";
import { createJobStore } from "./src/jobs/store.ts";

const roots: string[] = [];

describe("local job administration", () => {
  test("queries versioned status and audits local mutations", async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-admin-"));
    roots.push(root);
    const store = await createJobStore(join(root, "jobs"), { now: () => 50 });
    const queue = createJobQueue(store, { now: () => 50, ownerToken: "worker-a" });
    await queue.enqueue({ instanceId: "job-1", input: { secret: true } });
    await queue.transition("job-1", "available");
    await queue.acquire("job-1");
    await queue.transition("job-1", "dead-lettered", {
      failure: {
        kind: "provider",
        outcome: "provider-failure",
        code: "PROVIDER_FAILED",
        message: "provider failed",
      },
    });
    await queue.enqueue({ instanceId: "job-2", input: null });
    await queue.transition("job-2", "available");

    const admin = createJobAdmin(queue, {
      mode: "development",
      now: () => 50,
      createActionId: (() => {
        let next = 0;
        return () => `action-${++next}`;
      })(),
    });
    expect(admin.status("job-1")).toMatchObject({
      protocol: "relkit.jobs.admin",
      version: 1,
      state: "dead-lettered",
      failure: { code: "PROVIDER_FAILED" },
    });
    expect(admin.status("job-1")).not.toHaveProperty("input");

    const retried = await admin.retry({ instanceId: "job-1", reason: "inspect" });
    expect(retried).toMatchObject({
      action: "retry",
      status: { state: "available", attempt: 0 },
      record: { actionId: "action-1", outcome: "applied", fromState: "dead-lettered" },
    });
    const cancelled = await admin.cancel({ instanceId: "job-1", reason: "stop locally" });
    expect(cancelled.status).toMatchObject({
      state: "dead-lettered",
      failure: { outcome: "cancelled" },
    });
    await admin.deadLetter("job-2");

    const firstPage = admin.query({ limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeDefined();
    expect(admin.query({ cursor: firstPage.nextCursor, limit: 1 }).items).toHaveLength(1);
    expect(admin.actions()).toHaveLength(3);

    const production = createJobAdmin(queue, {
      mode: "production",
      now: () => 50,
      createActionId: () => "action-production",
    });
    await expect(production.cancel("job-1")).rejects.toMatchObject({
      code: "RELKIT_JOB_ADMIN_MUTATION_DISABLED",
    });
    expect(production.actions()[0]).toMatchObject({
      actionId: "action-production",
      outcome: "rejected",
      errorCode: "RELKIT_JOB_ADMIN_MUTATION_DISABLED",
    });
    expect(queue.get("job-1")?.state).toBe("dead-lettered");
    await store.close();
  });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
