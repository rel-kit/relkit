import { describe, expect, test } from "bun:test";
import * as pulumi from "@pulumi/pulumi";
import type { MockResourceArgs } from "@pulumi/pulumi/runtime/mocks";
import { toAwsScheduleExpression, ZsysJobQueues } from "./src/index.js";

interface SeenResource {
  readonly type: string;
  readonly name: string;
  readonly inputs: Record<string, any>;
}

describe("ZsysJobQueues", () => {
  test("maps queues, redrive policies, worker settings, and schedules", async () => {
    const resources: SeenResource[] = [];
    await pulumi.runtime.setMocks(
      {
        newResource: (args: MockResourceArgs) => {
          resources.push({ type: args.type, name: args.name, inputs: args.inputs });
          return {
            id: `${args.name}-id`,
            state: {
              ...args.inputs,
              arn: `arn:test:${args.name}`,
              name: args.inputs.name ?? args.name,
              url: `https://sqs.test/${args.name}`,
              role: args.inputs.role ?? args.name,
            },
          };
        },
        call: () => ({ region: "us-east-1", name: "us-east-1" }),
      },
      "zsys-queues-test",
      "development",
    );

    let component: ZsysJobQueues | undefined;
    await pulumi.runtime.runInPulumiStack(() => {
      component = new ZsysJobQueues("orders", {
        appId: "orders.app",
        graphHash: "sha256:orders",
        jobs: [
          {
            id: "receipts.send",
            retry: {
              maxAttempts: 3,
              initialDelayMs: 100,
              maxDelayMs: 10_000,
              multiplier: 2,
              jitter: "none",
            },
            timeoutMs: 30_000,
            concurrency: 4,
          },
        ],
        schedules: [
          {
            id: "receipts.nightly",
            jobId: "receipts.send",
            cron: "0 2 * * *",
            timezone: "UTC",
            input: { orderId: "123" },
            overlap: "skip",
          },
        ],
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(resources.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        "zsys:cloud-aws:ZsysJobQueues",
        "aws:sqs/queue:Queue",
        "aws:sqs/queuePolicy:QueuePolicy",
        "aws:sqs/redriveAllowPolicy:RedriveAllowPolicy",
        "aws:iam/role:Role",
        "aws:iam/rolePolicy:RolePolicy",
        "aws:scheduler/schedule:Schedule",
      ]),
    );
    const queue = resourceMatching(
      resources,
      "aws:sqs/queue:Queue",
      (item) => item.inputs.redrivePolicy !== undefined,
    );
    expect(queue.inputs).toMatchObject({
      receiveWaitTimeSeconds: 20,
      visibilityTimeoutSeconds: 60,
    });
    const redrive = JSON.parse(await resolveValue(queue.inputs.redrivePolicy));
    expect(redrive.maxReceiveCount).toBe(3);
    expect(redrive.deadLetterTargetArn).toContain("arn:test:");

    const queuePolicies = await Promise.all(
      resources
        .filter(({ type }) => type === "aws:sqs/queuePolicy:QueuePolicy")
        .map(async (item) => JSON.parse(await resolveValue(item.inputs.policy))),
    );
    const queuePolicy = queuePolicies.find((policy) =>
      policy.Statement.some((statement: { Sid: string }) => statement.Sid === "WorkerConsume"),
    );
    expect(queuePolicy).toBeDefined();
    expect(queuePolicy!.Statement.map((statement: { Sid: string }) => statement.Sid)).toEqual(
      expect.arrayContaining(["WorkerConsume", "SchedulerSend"]),
    );
    const schedule = resource(resources, "aws:scheduler/schedule:Schedule");
    expect(schedule.inputs).toMatchObject({
      scheduleExpression: "cron(0 2 * * ? *)",
      scheduleExpressionTimezone: "UTC",
      flexibleTimeWindow: { mode: "OFF" },
    });
    const target = await resolveValue(schedule.inputs.target);
    expect(target.input).toBe('{"orderId":"123"}');
    expect(target.retryPolicy).toEqual({
      maximumRetryAttempts: 3,
      maximumEventAgeInSeconds: 86_400,
    });
    expect(component!.workerConfigurations[0]!.deliverySemantics).toBe("at-least-once");
    expect(component!.workerConfigurations[0]!.environment).toBeDefined();
  });

  test("validates redrive counts and AWS cron shape", () => {
    expect(toAwsScheduleExpression("0 2 * * *")).toBe("cron(0 2 * * ? *)");
    expect(toAwsScheduleExpression("0 9 * * MON-FRI")).toBe("cron(0 9 ? * MON-FRI *)");
    expect(() => toAwsScheduleExpression("0 2 1 * MON")).toThrow();
    expect(
      () =>
        new ZsysJobQueues("invalid", {
          jobs: [
            {
              id: "job",
              retry: {
                maxAttempts: 2,
                initialDelayMs: 0,
                maxDelayMs: 0,
                multiplier: 1,
                jitter: "none",
              },
              maxReceiveCount: 3,
            },
          ],
        }),
    ).toThrow("maxReceiveCount");
  });
});

function resource(resources: readonly SeenResource[], type: string): SeenResource {
  const value = resources.find((item) => item.type === type);
  if (value === undefined) throw new Error(`Missing mocked resource ${type}.`);
  return value;
}

function resourceMatching(
  resources: readonly SeenResource[],
  type: string,
  predicate: (resource: SeenResource) => boolean,
): SeenResource {
  const value = resources.find((item) => item.type === type && predicate(item));
  if (value === undefined) throw new Error(`Missing mocked resource ${type}.`);
  return value;
}

function resolveValue<T>(value: T | pulumi.Output<T>): Promise<T> {
  if (value !== null && typeof value === "object" && "apply" in value)
    return new Promise((resolve) => (value as pulumi.Output<T>).apply(resolve));
  return Promise.resolve(value as T);
}
