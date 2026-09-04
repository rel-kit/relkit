import { describe, expect, test } from "bun:test";
import * as pulumi from "@pulumi/pulumi";
import type { MockResourceArgs } from "@pulumi/pulumi/runtime/mocks";
import { RelkitEventBus } from "./src/index.js";
import { childResourceName } from "./src/components/RelkitEventBus/names.js";

interface SeenResource {
  readonly type: string;
  readonly inputs: Record<string, any>;
}

const retry = {
  maxAttempts: 4,
  initialDelayMs: 100,
  maxDelayMs: 30_000,
  multiplier: 2,
  jitter: "full",
} as const;

describe("RelkitEventBus", () => {
  test("keeps truncated child resource names distinct", () => {
    const prefix = "relkit-nightly-1787163689822-commerce-api-events";
    const first = childResourceName(prefix, "orders.audit-changes-orders.created@1", "rule", 64);
    const second = childResourceName(prefix, "orders.audit-changes-orders.updated@1", "rule", 64);

    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(second.length).toBeLessThanOrEqual(64);
  });

  test("maps explicit versions to independent durable fan-out queues", async () => {
    const resources: SeenResource[] = [];
    await pulumi.runtime.setMocks(
      {
        newResource: (args: MockResourceArgs) => {
          resources.push({ type: args.type, inputs: args.inputs });
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
      "relkit-event-bus-test",
      "development",
    );

    let component: RelkitEventBus | undefined;
    await pulumi.runtime.runInPulumiStack(() => {
      component = new RelkitEventBus("orders", {
        appId: "orders.app",
        graphHash: "sha256:orders",
        events: [
          { id: "orders.created", version: 1 },
          { id: "orders.created", version: 2 },
        ],
        eventTriggers: [
          {
            id: "receipts.on-created",
            targetFunctionId: "receipts.send",
            eventId: "orders.created",
            eventVersion: 1,
            retry,
            concurrency: 2,
          },
          {
            id: "audit.on-created",
            targetFunctionId: "audit.record",
            eventId: "orders.created",
            eventVersion: 2,
            retry,
          },
        ],
        eventBridgeRetryPolicy: {
          maximumRetryAttempts: 5,
          maximumEventAgeInSeconds: 3_600,
        },
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(resources.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        "relkit:cloud-aws:RelkitEventBus",
        "aws:cloudwatch/eventBus:EventBus",
        "aws:cloudwatch/eventRule:EventRule",
        "aws:cloudwatch/eventTarget:EventTarget",
        "aws:sqs/queue:Queue",
        "aws:sqs/queuePolicy:QueuePolicy",
        "aws:sqs/redriveAllowPolicy:RedriveAllowPolicy",
        "aws:iam/role:Role",
        "aws:iam/rolePolicy:RolePolicy",
      ]),
    );
    expect(component?.triggers).toHaveLength(2);
    expect(component?.rules).toHaveLength(2);
    expect(new Set(component?.triggers.map(({ queue }) => queue.urn)).size).toBe(2);
    expect(component?.workerConfigurations[0]).toMatchObject({
      eventTriggerId: "receipts.on-created",
      targetFunctionId: "receipts.send",
      eventId: "orders.created",
      eventVersion: 1,
      deliverySemantics: "at-least-once",
      envelopePath: "$.envelope",
      tracePath: "$.envelope.propagation.producer.traceId",
      correlationPath: "$.envelope.propagation.correlationId",
    });

    const rules = resources.filter(({ type }) => type === "aws:cloudwatch/eventRule:EventRule");
    const pairs = rules.map(({ inputs }) => {
      const pattern = JSON.parse(inputs.eventPattern as string) as {
        readonly detail: {
          readonly eventId: readonly string[];
          readonly version: readonly number[];
        };
      };
      return `${pattern.detail.eventId[0]}@${pattern.detail.version[0]}`;
    });
    expect(pairs).toEqual(expect.arrayContaining(["orders.created@1", "orders.created@2"]));

    const targets = resources.filter(
      ({ type }) => type === "aws:cloudwatch/eventTarget:EventTarget",
    );
    expect(targets[0]?.inputs).toMatchObject({
      retryPolicy: { maximumRetryAttempts: 5, maximumEventAgeInSeconds: 3_600 },
      inputTransformer: {
        inputPaths: { envelope: "$.detail" },
        inputTemplate: '{"schemaVersion":1,"envelope":<envelope>}',
      },
    });
    const queue = resourceMatching(
      resources,
      "aws:sqs/queue:Queue",
      ({ inputs }) => inputs.redrivePolicy !== undefined,
    );
    expect(JSON.parse(await resolveValue(queue.inputs.redrivePolicy))).toMatchObject({
      maxReceiveCount: 4,
    });
    expect(resources.filter(({ type }) => type === "aws:sqs/queuePolicy:QueuePolicy")).toHaveLength(
      4,
    );
    const eventPolicy = JSON.parse(
      await resolveValue(
        resourceMatching(resources, "aws:sqs/queuePolicy:QueuePolicy", ({ inputs }) =>
          String(inputs.policy).includes("EventBridgeSend"),
        ).inputs.policy,
      ),
    );
    expect(eventPolicy.Statement[0]).toMatchObject({
      Principal: { Service: "events.amazonaws.com" },
      Action: "sqs:SendMessage",
    });
  });

  test("rejects unknown versions and retry/redrive mismatches before resources", () => {
    expect(
      () =>
        new RelkitEventBus("orders", {
          events: [{ id: "orders.created", version: 1 }],
          eventTriggers: [
            {
              id: "orders.listener",
              targetFunctionId: "orders.handle",
              eventId: "orders.created",
              eventVersion: 2,
            },
          ],
        }),
    ).toThrow("unknown event");
    expect(
      () =>
        new RelkitEventBus("orders", {
          events: [{ id: "orders.created", version: 1 }],
          eventTriggers: [
            {
              id: "orders.listener",
              targetFunctionId: "orders.handle",
              eventId: "orders.created",
              eventVersion: 1,
              maxReceiveCount: 2,
            },
          ],
        }),
    ).toThrow("maxReceiveCount");
  });
});

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
