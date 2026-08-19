import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { resourceName, tagsFor } from "../common.js";
import { childResourceName } from "./names.js";
import { createConsumerPolicy, createConsumerRole } from "./policies.js";
import { createTriggerResources } from "./resources.js";
import {
  normalizeEventBridgeRetry,
  normalizeEvents,
  normalizeSource,
  normalizeTriggers,
} from "./validation.js";
import type {
  ZsysEventBusArgs,
  ZsysEventTriggerResource,
  ZsysEventWorkerConfiguration,
} from "./types.js";

export * from "./types.js";
export { eventPattern } from "./validation.js";

/** Maps versioned ZSys events to independent durable EventBridge/SQS triggers. */
export class ZsysEventBus extends pulumi.ComponentResource {
  readonly eventBus: aws.cloudwatch.EventBus;
  readonly bus: aws.cloudwatch.EventBus;
  readonly eventBusName: pulumi.Output<string>;
  readonly eventBusArn: pulumi.Output<string>;
  readonly triggers: readonly ZsysEventTriggerResource[];
  readonly eventTriggers: readonly ZsysEventTriggerResource[];
  readonly rules: readonly aws.cloudwatch.EventRule[];
  readonly eventRules: readonly aws.cloudwatch.EventRule[];
  readonly targets: readonly aws.cloudwatch.EventTarget[];
  readonly workerConfigurations: readonly ZsysEventWorkerConfiguration[];
  readonly consumerRole: aws.iam.Role | undefined;
  readonly consumerRoleArn: pulumi.Output<string> | undefined;
  readonly consumerPolicy: aws.iam.RolePolicy | undefined;
  readonly tags: pulumi.Output<Record<string, string>>;

  constructor(name: string, args: ZsysEventBusArgs, opts: pulumi.ComponentResourceOptions = {}) {
    const events = normalizeEvents(args.events);
    const triggers = normalizeTriggers(args, events);
    const eventSource = normalizeSource(args.eventSource);
    const eventBridgeRetry = normalizeEventBridgeRetry(args.eventBridgeRetryPolicy);
    const componentName = resourceName(name, "events", args, 64);
    super("zsys:cloud-aws:ZsysEventBus", componentName, {}, opts);
    this.tags = tagsFor(name, args);
    const busName = args.eventBusName ?? childResourceName(componentName, "events", "bus", 256);
    this.eventBus = new aws.cloudwatch.EventBus(
      childResourceName(componentName, "events", "bus"),
      { name: busName, tags: this.tags },
      { parent: this },
    );
    this.bus = this.eventBus;
    this.eventBusName = this.eventBus.name;
    this.eventBusArn = this.eventBus.arn;
    if (triggers.length > 0) {
      const role =
        args.consumerRoleArn === undefined && args.workerRoleArn === undefined
          ? createConsumerRole(componentName, this.tags, this)
          : undefined;
      this.consumerRole = role;
      this.consumerRoleArn =
        role?.arn ?? pulumi.output(args.consumerRoleArn ?? args.workerRoleArn!);
      this.triggers = triggers.map((trigger) =>
        createTriggerResources(
          componentName,
          this.eventBusName,
          eventSource,
          eventBridgeRetry,
          trigger,
          this.tags,
          this.consumerRoleArn!,
          this,
        ),
      );
      this.consumerPolicy = role
        ? createConsumerPolicy(
            componentName,
            role,
            this.triggers.map(({ queue }) => queue.arn),
            this,
          )
        : undefined;
    } else {
      this.consumerRole = undefined;
      this.consumerRoleArn = undefined;
      this.consumerPolicy = undefined;
      this.triggers = [];
    }
    this.eventTriggers = this.triggers;
    this.rules = this.triggers.flatMap(({ rules }) => rules);
    this.eventRules = this.rules;
    this.targets = this.triggers.flatMap(({ targets }) => targets);
    this.workerConfigurations = this.triggers.map(({ worker }) => worker);
    this.registerOutputs({
      eventBusArn: this.eventBusArn,
      eventBusName: this.eventBusName,
      eventRuleArns: this.rules.map(({ arn }) => arn),
      eventTriggerQueueArns: this.triggers.map(({ queue }) => queue.arn),
      eventTriggerDeadLetterQueueArns: this.triggers.map(
        ({ deadLetterQueue }) => deadLetterQueue.arn,
      ),
    });
  }
}
