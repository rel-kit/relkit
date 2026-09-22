import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  authorizeJobAccess,
  defineJob,
  defineTask,
  JobAuthorizationError,
  projectRunSnapshot,
} from "./src/index.ts";

const task = defineTask({
  id: "orders.authorize",
  version: "1",
  input: z.string(),
  output: z.string(),
  handler: async (input) => input,
});

test("validates job grants and passes trusted authorization context", async () => {
  let received: unknown;
  const job = defineJob({
    name: "authorizeOrders",
    task,
    client: {
      operations: ["get"],
      authorize: (request, context) => {
        received = { request, context };
        return { scope: "tenant:one:orders", expiresAt: "2099-01-01T00:00:00.000Z" };
      },
    },
  });
  const grant = await authorizeJobAccess(
    job,
    { operation: "get", jobId: job.id, runId: "run-1" },
    { application: "commerce", environment: "test", scope: "tenant:one", subject: "user-1" },
    {
      application: "commerce",
      environment: "test",
      scope: "tenant:one",
      subject: "user-1",
      auth: { principal: "user-1" },
    },
  );
  expect(grant.scope).toBe("tenant:one:orders");
  expect(received).toMatchObject({
    request: { operation: "get", jobId: job.id, runId: "run-1" },
    context: {
      application: "commerce",
      environment: "test",
      scope: "tenant:one",
      subject: "user-1",
    },
  });
});

test("rejects boolean, expired, and out-of-scope grants while keeping public scope dedicated", async () => {
  const privateJob = defineJob({
    name: "privateOrders",
    task,
    client: { operations: ["get"], authorize: () => ({ scope: "other-tenant" }) },
  });
  await expect(
    authorizeJobAccess(privateJob, { operation: "get", jobId: privateJob.id }, trusted()),
  ).rejects.toBeInstanceOf(JobAuthorizationError);

  const malformedJob = defineJob({
    name: "malformedOrders",
    task,
    client: { operations: ["get"], authorize: () => ({ scope: "tenant:one", unexpected: true }) },
  });
  await expect(
    authorizeJobAccess(malformedJob, { operation: "get", jobId: malformedJob.id }, trusted()),
  ).rejects.toBeInstanceOf(JobAuthorizationError);

  const expiredJob = defineJob({
    name: "expiredOrders",
    task,
    client: {
      operations: ["get"],
      authorize: () => ({ scope: "tenant:one", expiresAt: "2020-01-01T00:00:00.000Z" }),
    },
  });
  await expect(
    authorizeJobAccess(expiredJob, { operation: "get", jobId: expiredJob.id }, trusted()),
  ).rejects.toBeInstanceOf(JobAuthorizationError);

  const publicJob = defineJob({
    name: "publicOrders",
    task,
    client: { public: true, operations: ["get"] },
  });
  await expect(
    authorizeJobAccess(
      publicJob,
      { operation: "get", jobId: publicJob.id },
      {
        ...trusted(),
        scope: "public:commerce",
      },
    ),
  ).resolves.toMatchObject({
    scope: "public:commerce",
  });
});

test("redacts unknown failures while preserving bounded declared details", () => {
  const run = {
    accepted: true as const,
    runId: "run-1",
    jobId: "orders.authorize",
    taskId: "orders.authorize",
    taskVersion: "1",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    buildId: "build-1",
    service: "local",
    status: "failed" as const,
    observedAt: "2026-01-01T00:00:01.000Z",
    resultAvailability: "unavailable" as const,
    error: {
      code: "orders.failed",
      message: "safe failure",
      details: { orderId: "order-1" },
    },
  };
  expect(projectRunSnapshot(run, ["error"]).error).toEqual({
    code: "RELKIT_JOB_FAILURE",
    message: "Job failed",
  });
  expect(projectRunSnapshot(run, ["error"], { declaredErrorIds: ["orders.failed"] }).error).toEqual(
    {
      code: "orders.failed",
      message: "safe failure",
      details: { orderId: "order-1" },
    },
  );
});

function trusted() {
  return { application: "commerce", environment: "test", scope: "tenant:one" };
}
