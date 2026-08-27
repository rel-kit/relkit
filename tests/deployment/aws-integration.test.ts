import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import * as pulumi from "../../packages/cloud-aws/node_modules/@pulumi/pulumi/index.js";
import { fromGraph, type DeploymentPlan } from "../../packages/deploy/src/index.ts";
import { createPulumiProgram } from "../../packages/deploy-pulumi/src/program.ts";
import {
  createPulumiWorkspace,
  type PulumiBackend,
  type PulumiWorkspaceHandle,
} from "../../packages/deploy-pulumi/src/workspace.ts";
import type { ApplicationGraph } from "../../packages/graph/src/index.ts";
import { compileProject } from "../compiler/fixture-runner.ts";

const enabled =
  process.env.RELKIT_TEST_ALL_CLOUD === "1" && process.env.RELKIT_AWS_INTEGRATION === "1";
const awsTest = enabled ? test : test.skip;
const compiled = await compileProject(
  "aws-commerce-example",
  join(import.meta.dir, "../../examples/commerce"),
);
if (compiled.exitCode !== 0) throw new Error("commerce-example did not compile for AWS acceptance");
const graph = JSON.parse(compiled.graphBytes) as ApplicationGraph;

test("keeps source moves on stable deployment identities", () => {
  const moved = moveSources(graph);
  expect(JSON.stringify(moved)).not.toBe(JSON.stringify(graph));
  expect(resourceNames(planFor(moved, "example.invalid/relkit/smoke:latest"))).toEqual(
    resourceNames(planFor(graph, "example.invalid/relkit/smoke:latest")),
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
  const root = await mkdtemp(join(tmpdir(), "relkit-aws-integration-"));
  const stackName = `relkit-nightly-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const marker = `relkit-aws-smoke-${randomUUID()}`;
  const appId = graph.appId ?? "commerce-api";
  const initialPlan = planFor(graph, config.image);
  let active: PulumiWorkspaceHandle | undefined;
  let primaryError: unknown;
  let cleanupError: unknown;

  try {
    active = await openStack(root, stackName, config, initialPlan, marker, "create-or-select");
    await up(active, config.operationTimeoutMs);
    const outputs = await smokeOutputs(active);
    await waitForReadiness(outputs.endpoint, config.operationTimeoutMs);
    await exerciseProduct(outputs, marker, config.region, config.operationTimeoutMs);
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
    process.env.RELKIT_AWS_INTEGRATION_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION;
  const image = process.env.RELKIT_AWS_INTEGRATION_IMAGE;
  if (region === undefined || image === undefined || image.trim() === "")
    throw new Error(
      "RELKIT_AWS_INTEGRATION_REGION/AWS_REGION and RELKIT_AWS_INTEGRATION_IMAGE are required.",
    );
  const backendValue = process.env.RELKIT_AWS_INTEGRATION_BACKEND ?? "cloud";
  const backend =
    backendValue === "cloud"
      ? ({ kind: "cloud" } as const)
      : ({ kind: "object-storage", url: backendValue } as const);
  return {
    region,
    image,
    backend,
    operationTimeoutMs: duration("RELKIT_AWS_INTEGRATION_TIMEOUT_MS", 900_000),
    cleanupTimeoutMs: duration("RELKIT_AWS_CLEANUP_TIMEOUT_MS", 600_000),
  };
}

function planFor(value: ApplicationGraph, image: string): DeploymentPlan {
  return fromGraph(value, {
    image: {
      name: image,
      health: {
        livenessPath: "/_relkit/v1/health/live",
        readinessPath: "/_relkit/v1/health/ready",
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
    program: createPulumiProgram(plan, {
      stackName,
      aws: {
        region: config.region,
        forceDelete: true,
        forceDestroy: true,
        tags: { "relkit-smoke": marker },
        serviceEnvironment: ({ jobs, events, buckets, caches }) => ({
          NODE_ENV: "production",
          RELKIT_ENV: "production",
          AWS_REGION: config.region,
          ASSETS_BUCKET_NAME: buckets.buckets[0]!.name,
          JOB_QUEUE_URL: jobs.queues[0]!.worker.queueUrl,
          EVENT_BUS_NAME: events.eventBusName,
          CACHE_ENDPOINT: caches.caches[0]!.url,
        }),
      },
    }),
    envVars: {
      AWS_REGION: config.region,
      AWS_DEFAULT_REGION: config.region,
      AWS_PAGER: "",
    },
  });
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

async function exerciseProduct(
  outputs: SmokeOutputs,
  marker: string,
  region: string,
  timeoutMs: number,
): Promise<void> {
  const response = await fetch(`${outputs.endpoint}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": marker,
      "x-customer-email": "aws-acceptance@example.invalid",
    },
    body: JSON.stringify({ sku: marker, quantity: 1 }),
    signal: AbortSignal.timeout(60_000),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    orderId: marker,
    receiptKey: `${marker}.json`,
    totalCents: 1_000,
  });
  await waitForObject(outputs.bucketName, `${marker}.json`, region, timeoutMs);
}

async function waitForObject(
  bucketName: string,
  key: string,
  region: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await awsCli(
        ["s3api", "head-object", "--bucket", bucketName, "--key", key, "--region", region],
        Math.min(60_000, Math.max(1_000, deadline - Date.now())),
      );
      return;
    } catch {
      await delay(5_000);
    }
  }
  throw new Error("AWS integration receipt was not written through the RelKit job worker.");
}

async function waitForReadiness(endpoint: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/_relkit/v1/health/ready`, {
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
        `Key=managed-by,Values=relkit`,
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
  const logPath = process.env.RELKIT_AWS_PULUMI_DEBUG_LOG;
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
