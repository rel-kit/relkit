import { expect, test } from "bun:test";
import type { DeploymentHostMaterialization, DeploymentPlan } from "@relkit/deploy";
import { nativeWorkerOperations } from "./src/worker-materialization.ts";

test("scopes schedule activation resources by owning job", () => {
  const plan = {
    jobs: [workerJob("orders-a"), workerJob("orders-b")],
    schedules: [schedule("orders-a"), schedule("orders-b")],
  } as unknown as DeploymentPlan;
  const host = {
    resources: [],
    workload: { roleArn: "arn:test:role" },
  } as DeploymentHostMaterialization;

  expect(nativeWorkerOperations(plan, host).map((resource) => resource.id)).toEqual([
    "orders-a.worker.publish",
    "orders-a.worker.register",
    "orders-a.worker.readiness",
    "orders-a.daily.activate",
    "orders-b.worker.publish",
    "orders-b.worker.register",
    "orders-b.worker.readiness",
    "orders-b.daily.activate",
  ]);
});

function workerJob(id: string) {
  return {
    id,
    logicalName: id,
    worker: {
      provider: "local",
      publication: "native" as const,
      taskId: `${id}.task`,
      taskVersion: "1",
      buildId: `${id}-build`,
      serviceGeneration: `${id}-generation`,
      runtime: "bun" as const,
      stages: [
        "provision",
        "secrets",
        "publish",
        "register",
        "readiness",
        "schedules",
        "activate",
      ] as const,
    },
    configurationNames: [],
    jobId: id,
    name: id,
  };
}

function schedule(jobId: string) {
  return {
    id: "daily",
    logicalName: `${jobId}-daily`,
    jobId,
    schedule: { id: "daily", cron: "0 0 * * *" },
    bindingId: `${jobId}.job`,
    configurationNames: [],
  };
}
