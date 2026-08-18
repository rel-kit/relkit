import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import * as aws from "../../packages/cloud-aws/node_modules/@pulumi/aws/index.js";
import * as pulumi from "../../packages/cloud-aws/node_modules/@pulumi/pulumi/index.js";
import type { PulumiFn } from "../../packages/cloud-aws/node_modules/@pulumi/pulumi/automation/index.js";
import {
  ZsysApplicationService,
  ZsysBuckets,
  ZsysCaches,
  ZsysContainerRegistry,
  ZsysEventBus,
  ZsysJobQueues,
  ZsysNetwork,
  ZsysObservability,
} from "../../packages/cloud-aws/src/index.ts";
import { fromGraph, type DeploymentPlan } from "../../packages/deploy/src/index.ts";
import {
  createPulumiWorkspace,
  type PulumiBackend,
  type PulumiWorkspaceHandle,
} from "../../packages/deploy-pulumi/src/workspace.ts";
import type { ApplicationGraph } from "../../packages/graph/src/index.ts";

const enabled = process.env.ZSYS_AWS_INTEGRATION === "1";
const awsTest = enabled ? test : test.skip;
/** The release-provided image implements these bounded provider smoke routes. */
const smokePaths = [
  "/__zsys/aws-smoke/job",
  "/__zsys/aws-smoke/event",
  "/__zsys/aws-smoke/bucket",
  "/__zsys/aws-smoke/cache",
  "/__zsys/aws-smoke/logs",
] as const;

const graph = JSON.parse(
  await readFile(
    join(import.meta.dir, "../compiler/fixtures/valid-full/expected.graph.json"),
    "utf8",
  ),
) as ApplicationGraph;

test("keeps source moves on stable deployment identities", () => {
  const moved = moveSources(graph);
  expect(JSON.stringify(moved)).not.toBe(JSON.stringify(graph));
  expect(resourceNames(planFor(moved, "example.invalid/zsys/smoke:latest"))).toEqual(
    resourceNames(planFor(graph, "example.invalid/zsys/smoke:latest")),
  );
});

interface IntegrationConfig {
  readonly region: string;
  readonly image: string;
  readonly backend: PulumiBackend;
  readonly operationTimeoutMs: number;
  readonly cleanupTimeoutMs: number;
}

interface SmokeOutputs {
  readonly endpoint: string;
  readonly bucketName: string;
  readonly queueUrl: string;
  readonly eventBusName: string;
  readonly cacheUrl: string;
  readonly logGroupName: string;
}

awsTest("creates, smokes, updates, and independently cleans an ephemeral AWS stack", async () => {
  const config = integrationConfig();
  const root = await mkdtemp(join(tmpdir(), "zsys-aws-integration-"));
  const stackName = `zsys-nightly-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const marker = `zsys-aws-smoke-${randomUUID()}`;
  const appId = "full-app";
  const initialPlan = planFor(graph, config.image);
  let active: PulumiWorkspaceHandle | undefined;
  let primaryError: unknown;
  let cleanupError: unknown;

  try {
    active = await openStack(root, stackName, config, initialPlan, marker, "create-or-select");
    await up(active, config.operationTimeoutMs);
    const outputs = await smokeOutputs(active);
    await waitForReadiness(outputs.endpoint, config.operationTimeoutMs);
    await exerciseHttp(outputs.endpoint, marker);
    await waitForLog(outputs.logGroupName, marker, config.region, config.operationTimeoutMs);

    const noOp = await up(active, config.operationTimeoutMs);
    expect(changeCount(noOp.summary.resourceChanges)).toBe(0);

    const moved = moveSources(graph);
    const movedPlan = planFor(moved, config.image);
    expect(resourceNames(movedPlan)).toEqual(resourceNames(initialPlan));
    active = await openStack(root, stackName, config, movedPlan, marker, "select");
    const movedPreview = await active.stack.preview(pulumiUpdateOptions(config.operationTimeoutMs));
    expect(replacementCount(movedPreview.changeSummary)).toBe(0);
    const movedUpdate = await up(active, config.operationTimeoutMs);
    expect(replacementCount(movedUpdate.summary.resourceChanges)).toBe(0);
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      if (active !== undefined) await destroy(active, config.operationTimeoutMs);
      await waitForCleanup(appId, stackName, config);
    } catch (error) {
      cleanupError = error;
    }
    await rm(root, { recursive: true, force: true });
  }

  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
});

function integrationConfig(): IntegrationConfig {
  const region =
    process.env.ZSYS_AWS_INTEGRATION_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION;
  const image = process.env.ZSYS_AWS_INTEGRATION_IMAGE;
  if (region === undefined || image === undefined || image.trim() === "")
    throw new Error(
      "ZSYS_AWS_INTEGRATION_REGION/AWS_REGION and ZSYS_AWS_INTEGRATION_IMAGE are required.",
    );
  const backendValue = process.env.ZSYS_AWS_INTEGRATION_BACKEND ?? "cloud";
  const backend =
    backendValue === "cloud"
      ? ({ kind: "cloud" } as const)
      : ({ kind: "object-storage", url: backendValue } as const);
  return {
    region,
    image,
    backend,
    operationTimeoutMs: duration("ZSYS_AWS_INTEGRATION_TIMEOUT_MS", 900_000),
    cleanupTimeoutMs: duration("ZSYS_AWS_CLEANUP_TIMEOUT_MS", 600_000),
  };
}

function planFor(value: ApplicationGraph, image: string): DeploymentPlan {
  return fromGraph(value, {
    image: {
      name: image,
      health: {
        livenessPath: "/_zsys/v1/health/live",
        readinessPath: "/_zsys/v1/health/ready",
        port: 3000,
      },
    },
  });
}

async function openStack(
  root: string,
  stackName: string,
  config: IntegrationConfig,
  plan: DeploymentPlan,
  marker: string,
  mode: "create-or-select" | "select",
): Promise<PulumiWorkspaceHandle> {
  return createPulumiWorkspace({
    projectName: plan.application.id,
    stackName,
    workDir: join(root, "program"),
    pulumiHome: join(root, "pulumi-home"),
    backend: config.backend,
    mode,
    program: awsProgram(plan, config, marker),
    envVars: {
      AWS_REGION: config.region,
      AWS_DEFAULT_REGION: config.region,
      AWS_PAGER: "",
    },
  });
}

function awsProgram(plan: DeploymentPlan, config: IntegrationConfig, marker: string): PulumiFn {
  return async () => {
    const root = new pulumi.ComponentResource(
      "zsys:aws-integration:application",
      plan.application.id,
    );
    const common = {
      appId: plan.application.id,
      stackName: pulumi.getStack(),
      graphHash: plan.graphHash,
      region: config.region,
      tags: { "zsys-smoke": marker },
    } as const;
    const network = new ZsysNetwork(
      "network",
      { ...common, natGatewayStrategy: "Single" },
      { parent: root },
    );
    const registry = new ZsysContainerRegistry(
      "registry",
      { ...common, forceDelete: true },
      { parent: root },
    );
    const job = plan.jobs[0];
    const event = plan.events[0];
    const trigger = plan.eventTriggers[0];
    const bucket = plan.buckets[0];
    const cache = plan.caches[0];
    if (
      job === undefined ||
      event === undefined ||
      trigger === undefined ||
      bucket === undefined ||
      cache === undefined
    )
      throw new Error("AWS integration requires the full deployment fixture capabilities.");
    const queues = new ZsysJobQueues(
      "jobs",
      {
        ...common,
        jobs: [{ id: job.id, retry: retryPolicy(job.retry), timeoutMs: job.timeoutMs }],
      },
      { parent: root },
    );
    const events = new ZsysEventBus(
      "events",
      {
        ...common,
        events: plan.events.map(({ id, version }) => ({ id, version })),
        eventTriggers: [
          {
            id: trigger.id,
            targetFunctionId: trigger.targetFunctionId,
            expansion: trigger.expansion,
            retry: retryPolicy(trigger.retry),
            timeoutMs: 30_000,
          },
        ],
        eventSource: "zsys.application",
      },
      { parent: root },
    );
    const buckets = new ZsysBuckets(
      "buckets",
      {
        ...common,
        buckets: [{ id: bucket.id, visibility: bucket.visibility, forceDestroy: true }],
      },
      { parent: root },
    );
    const caches = new ZsysCaches(
      "caches",
      { ...common, network, caches: [{ id: cache.id }] },
      { parent: root },
    );
    const observability = new ZsysObservability("observability", { ...common }, { parent: root });
    const service = new ZsysApplicationService(
      "service",
      {
        ...common,
        network,
        registry,
        image: plan.application.image.name,
        environment: {
          ZSYS_AWS_SMOKE_MARKER: marker,
          ZSYS_AWS_SMOKE_BUCKET_NAME: buckets.buckets[0]!.name,
          ZSYS_AWS_SMOKE_QUEUE_URL: queues.queues[0]!.worker.queueUrl,
          ZSYS_AWS_SMOKE_EVENT_BUS_NAME: events.eventBusName,
          ZSYS_AWS_SMOKE_CACHE_URL: caches.caches[0]!.url,
        },
      },
      { parent: root },
    );
    const bucketArn = buckets.buckets[0]!.arn;
    const queueArn = queues.queues[0]!.queue.arn;
    const eventBusArn = events.eventBusArn;
    const cacheArn = caches.caches[0]!.cache.arn;
    new aws.iam.RolePolicy(
      "smoke-access",
      {
        role: service.taskRole.name,
        policy: pulumi
          .all({ bucketArn, queueArn, eventBusArn, cacheArn })
          .apply(
            ({
              bucketArn: bucketResource,
              queueArn: queueResource,
              eventBusArn: busResource,
              cacheArn: cacheResource,
            }) =>
              JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
                    Resource: [bucketResource, `${bucketResource}/*`],
                  },
                  { Effect: "Allow", Action: ["sqs:SendMessage"], Resource: queueResource },
                  { Effect: "Allow", Action: ["events:PutEvents"], Resource: busResource },
                  { Effect: "Allow", Action: ["elasticache:Connect"], Resource: cacheResource },
                ],
              }),
          ),
      },
      { parent: root, dependsOn: [service, buckets, queues, events, caches] },
    );
    return {
      endpoint: pulumi.interpolate`http://${service.loadBalancer.dnsName}`,
      bucketName: buckets.buckets[0]!.name,
      queueUrl: queues.queues[0]!.worker.queueUrl,
      eventBusName: events.eventBusName,
      cacheUrl: caches.caches[0]!.url,
      logGroupName: service.logGroup.name,
      observabilityLogGroupName: observability.logGroupName,
    };
  };
}

async function smokeOutputs(handle: PulumiWorkspaceHandle): Promise<SmokeOutputs> {
  const outputs = await handle.stack.outputs();
  return {
    endpoint: output(outputs, "endpoint"),
    bucketName: output(outputs, "bucketName"),
    queueUrl: output(outputs, "queueUrl"),
    eventBusName: output(outputs, "eventBusName"),
    cacheUrl: output(outputs, "cacheUrl"),
    logGroupName: output(outputs, "logGroupName"),
  };
}

async function exerciseHttp(endpoint: string, marker: string): Promise<void> {
  for (const path of smokePaths) {
    const response = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marker }),
      signal: AbortSignal.timeout(60_000),
    });
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(await response.json()).toMatchObject({
      ok: true,
      operation: path.slice(path.lastIndexOf("/") + 1),
      marker,
    });
  }
}

async function waitForReadiness(endpoint: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/_zsys/v1/health/ready`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return;
    } catch {
      // The ALB and ECS target become reachable independently.
    }
    await delay(5_000);
  }
  throw new Error("AWS integration service did not become ready before the deadline.");
}

async function waitForLog(
  logGroupName: string,
  marker: string,
  region: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await awsCli(
      ["logs", "tail", logGroupName, "--region", region, "--since", "30m", "--format", "short"],
      Math.min(60_000, Math.max(1_000, deadline - Date.now())),
    );
    if (result.includes(marker)) return;
    await delay(5_000);
  }
  throw new Error("AWS integration log marker was not observed in CloudWatch.");
}

async function waitForCleanup(
  appId: string,
  stackName: string,
  config: IntegrationConfig,
): Promise<void> {
  const deadline = Date.now() + config.cleanupTimeoutMs;
  while (Date.now() < deadline) {
    const result = await awsCli(
      [
        "resourcegroupstaggingapi",
        "get-resources",
        "--region",
        config.region,
        "--tag-filters",
        `Key=managed-by,Values=zsys`,
        `Key=app,Values=${appId}`,
        `Key=stack,Values=${stackName}`,
        "--output",
        "json",
      ],
      Math.min(60_000, Math.max(1_000, deadline - Date.now())),
    );
    const resources =
      (
        JSON.parse(result) as {
          readonly ResourceTagMappingList?: readonly { readonly ResourceARN?: string }[];
        }
      ).ResourceTagMappingList ?? [];
    const live = await liveTaggedResources(
      resources.flatMap(({ ResourceARN }) => (ResourceARN === undefined ? [] : [ResourceARN])),
      config.region,
      Math.min(60_000, Math.max(1_000, deadline - Date.now())),
    );
    if (live.length === 0) return;
    await delay(5_000);
  }
  throw new Error(`AWS cleanup still reports tagged resources for stack ${stackName}.`);
}

async function liveTaggedResources(
  arns: readonly string[],
  region: string,
  timeoutMs: number,
): Promise<readonly string[]> {
  const live: string[] = [];
  for (const arn of arns) {
    if (!(await isDeletedAwsRecord(arn, region, timeoutMs))) live.push(arn);
  }
  return live;
}

async function isDeletedAwsRecord(
  arn: string,
  region: string,
  timeoutMs: number,
): Promise<boolean> {
  const resource = arn.split(":").slice(5).join(":");
  const [kind, first, second] = resource.split("/");
  if (kind === "natgateway" && first !== undefined) {
    const result = await awsCli(
      ["ec2", "describe-nat-gateways", "--region", region, "--nat-gateway-ids", first],
      timeoutMs,
    );
    return (
      (JSON.parse(result) as { readonly NatGateways?: readonly { readonly State?: string }[] })
        .NatGateways?.[0]?.State === "deleted"
    );
  }
  if (kind === "cluster" && first !== undefined) {
    const result = await awsCli(
      ["ecs", "describe-clusters", "--region", region, "--clusters", first],
      timeoutMs,
    );
    return (
      (JSON.parse(result) as { readonly clusters?: readonly { readonly status?: string }[] })
        .clusters?.[0]?.status === "INACTIVE"
    );
  }
  if (kind === "service" && first !== undefined && second !== undefined) {
    const result = await awsCli(
      ["ecs", "describe-services", "--region", region, "--cluster", first, "--services", second],
      timeoutMs,
    );
    return (
      (JSON.parse(result) as { readonly services?: readonly { readonly status?: string }[] })
        .services?.[0]?.status === "INACTIVE"
    );
  }
  if (kind === "task" && first !== undefined) {
    const result = await awsCli(
      ["ecs", "describe-tasks", "--region", region, "--cluster", first, "--tasks", arn],
      timeoutMs,
    );
    return (
      (JSON.parse(result) as { readonly tasks?: readonly { readonly lastStatus?: string }[] })
        .tasks?.[0]?.lastStatus === "STOPPED"
    );
  }
  if (kind === "task-definition" && first !== undefined) {
    const result = await awsCli(
      ["ecs", "describe-task-definition", "--region", region, "--task-definition", first],
      timeoutMs,
    );
    return (
      (JSON.parse(result) as { readonly taskDefinition?: { readonly status?: string } })
        .taskDefinition?.status === "INACTIVE"
    );
  }
  return false;
}

async function up(handle: PulumiWorkspaceHandle, timeoutMs: number) {
  return handle.stack.up(pulumiUpdateOptions(timeoutMs));
}

async function destroy(handle: PulumiWorkspaceHandle, timeoutMs: number): Promise<void> {
  await handle.stack.destroy(pulumiOptions(timeoutMs));
}

function pulumiUpdateOptions(timeoutMs: number) {
  return { ...pulumiOptions(timeoutMs), refresh: false };
}

function pulumiOptions(timeoutMs: number) {
  const logPath = process.env.ZSYS_AWS_PULUMI_DEBUG_LOG;
  const base = { signal: AbortSignal.timeout(timeoutMs) };
  if (logPath === undefined || logPath.trim() === "") return base;
  const log = (stream: string, line: string): void => {
    appendFileSync(logPath, `[${new Date().toISOString()}] ${stream}: ${line}\n`);
  };
  return {
    ...base,
    debug: true,
    logToStdErr: true,
    logVerbosity: 9,
    onError: (line: string) => log("stderr", line),
    onOutput: (line: string) => log("stdout", line),
  };
}

async function awsCli(args: readonly string[], timeoutMs: number): Promise<string> {
  const child = Bun.spawn(["aws", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, AWS_PAGER: "" },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      (async () => {
        const [stdout, , exitCode] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (exitCode !== 0) throw new Error("AWS CLI operation failed.");
        return stdout;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          child.kill();
          reject(new Error("AWS CLI operation timed out."));
        }, timeoutMs);
      }),
    ]);
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function output(
  outputs: Awaited<ReturnType<PulumiWorkspaceHandle["stack"]["outputs"]>>,
  name: string,
): string {
  const value = outputs[name]?.value;
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Pulumi output ${name} is missing.`);
  return value;
}

function replacementCount(summary: Record<string, number>): number {
  return (
    (summary.replace ?? 0) +
    (summary["create-replacement"] ?? 0) +
    (summary["delete-replaced"] ?? 0)
  );
}

function changeCount(summary: Record<string, number>): number {
  return Object.entries(summary)
    .filter(([name]) => !["same", "read", "refresh", "read-replacement"].includes(name))
    .reduce((total, [, count]) => total + count, 0);
}

function resourceNames(plan: DeploymentPlan): string[] {
  return [
    plan.application.id,
    plan.http.logicalName,
    ...plan.jobs.map(({ logicalName }) => logicalName),
    ...plan.schedules.map(({ logicalName }) => logicalName),
    ...plan.events.map(({ logicalName }) => logicalName),
    ...plan.eventTriggers.map(({ logicalName }) => logicalName),
    ...plan.buckets.map(({ logicalName }) => logicalName),
    ...plan.caches.map(({ logicalName }) => logicalName),
  ].sort();
}

function moveSources(value: ApplicationGraph): ApplicationGraph {
  const moved = structuredClone(value) as ApplicationGraph;
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (current === null || typeof current !== "object") return;
    const record = current as Record<string, unknown>;
    const source = record.source;
    if (source !== null && typeof source === "object" && !Array.isArray(source)) {
      const file = (source as Record<string, unknown>).file;
      if (typeof file === "string")
        (source as Record<string, unknown>).file = file.replace(/^src\//, "src/moved/");
    }
    Object.values(record).forEach(visit);
  };
  visit(moved);
  return moved;
}

function retryPolicy(value: unknown) {
  const retry =
    value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    maxAttempts: integer(retry.maxAttempts, 2),
    initialDelayMs: integer(retry.initialDelayMs, 100),
    maxDelayMs: integer(retry.maxDelayMs, 1_000),
    multiplier: number(retry.multiplier, 2),
    jitter: "none" as const,
  };
}

function duration(name: string, fallback: number): number {
  return integer(process.env[name], fallback, 1_000, 1_800_000);
}

function integer(
  value: unknown,
  fallback: number,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? value : fallback;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
