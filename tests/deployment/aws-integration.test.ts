import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import type { DeploymentPlan } from "../../packages/deploy/src/index.ts";
import { createPulumiProgram } from "../../packages/deploy-pulumi/src/program.ts";
import {
  createPulumiWorkspace,
  type PulumiBackend,
  type PulumiWorkspaceHandle,
} from "../../packages/deploy-pulumi/src/workspace.ts";
import { awsHost } from "../../integrations/packages/aws/src/host/index.ts";
import { pulumiEngine } from "../../integrations/packages/pulumi/src/engine/index.ts";

const enabled =
  process.env.RELKIT_TEST_ALL_CLOUD === "1" && process.env.RELKIT_AWS_INTEGRATION === "1";
const awsTest = enabled ? test : test.skip;

awsTest("creates, reaches, and destroys the explicit AWS host", async () => {
  const region = required(
    process.env.RELKIT_AWS_INTEGRATION_REGION ??
      process.env.AWS_REGION ??
      process.env.AWS_DEFAULT_REGION,
    "AWS integration region",
  );
  const image = required(process.env.RELKIT_AWS_INTEGRATION_IMAGE, "AWS integration image");
  const root = await mkdtemp(join(tmpdir(), "relkit-aws-integration-"));
  const stackName = `relkit-host-${Date.now()}-${randomUUID().slice(0, 8)}`;
  let handle: PulumiWorkspaceHandle | undefined;
  let primary: unknown;
  let cleanup: unknown;
  try {
    handle = await createPulumiWorkspace({
      projectName: "relkit-aws-host-smoke",
      stackName,
      workDir: join(root, "program"),
      pulumiHome: join(root, "pulumi-home"),
      backend: backend(),
      mode: "create-or-select",
      config: { "aws:region": { value: region } },
      envVars: { AWS_REGION: region, AWS_DEFAULT_REGION: region, AWS_PAGER: "" },
      program: createPulumiProgram(plan(image), {
        stackName,
        integrations: [pulumiEngine, awsHost],
      }),
    });
    await handle.stack.up({ onOutput: () => undefined });
    const endpoint = String((await handle.stack.outputs()).endpoint?.value ?? "");
    expect(endpoint).toStartWith("http://");
    await waitForReady(endpoint, 15 * 60_000);
    const preview = await handle.stack.preview({ onOutput: () => undefined });
    expect(changes(preview.changeSummary)).toBe(0);
  } catch (error) {
    primary = error;
  } finally {
    try {
      if (handle !== undefined) {
        await handle.stack.destroy({ onOutput: () => undefined });
        await handle.workspace.removeStack(handle.stackName);
      }
    } catch (error) {
      cleanup = error;
    }
    await rm(root, { recursive: true, force: true });
  }
  if (primary !== undefined) throw primary;
  if (cleanup !== undefined) throw cleanup;
});

function plan(image: string): DeploymentPlan {
  const health = {
    livenessPath: "/_relkit/v1/health/live",
    readinessPath: "/_relkit/v1/health/ready",
    port: 3000,
  };
  return {
    contractVersion: 3,
    graphHash: "sha256:aws-host-smoke",
    application: { id: "aws-host-smoke", image: { name: image, health }, environmentNames: [] },
    engine: role("engine", "pulumi"),
    host: role("host", "aws"),
    connectedBindings: [],
    infrastructureOperations: [],
    accessOperations: [],
    http: {
      logicalName: "aws-host-smoke-http",
      port: health.port,
      health,
      routes: [],
      configurationNames: [],
    },
    jobs: [],
    schedules: [],
    events: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    iam: { serviceRole: { statements: [] }, perFunction: [] },
  };
}

function role<Role extends "engine" | "host">(role: Role, integrationId: string) {
  return { role, integrationId, protocolVersion: 1 as const, configuration: {} };
}

function backend(): PulumiBackend {
  const value = process.env.RELKIT_AWS_INTEGRATION_BACKEND ?? "cloud";
  return value === "cloud" ? { kind: "cloud" } : { kind: "object-storage", url: value };
}

async function waitForReady(endpoint: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/_relkit/v1/health/ready`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return;
    } catch {
      // ECS and the load balancer become ready independently.
    }
    await Bun.sleep(5_000);
  }
  throw new Error("AWS host did not become ready before the deadline.");
}

function changes(summary: Record<string, number>): number {
  return Object.values(summary).reduce((total, count) => total + count, 0);
}

function required(value: string | undefined, label: string): string {
  if (value === undefined || value.trim() === "") throw new Error(`${label} is required.`);
  return value;
}
