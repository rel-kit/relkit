import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalJson } from "@zsys/contracts";
import type { DeploymentPlan } from "@zsys/deploy";
import * as pulumi from "@pulumi/pulumi";
import type { PulumiFn } from "@pulumi/pulumi/automation";
import { identity, snapshotPlan } from "./program-support.js";
import { createAwsPulumiResources, type AwsProgramOptions } from "./aws-program.js";

export const PULUMI_PROGRAM_VERSION = 1 as const;
const DEFAULT_STACK = "development";
const DEFAULT_DIRECTORY = ".zsys/generated/pulumi";

export interface PulumiProgramOptions {
  readonly stackName?: string;
  readonly projectName?: string;
  readonly projectRoot?: string;
  readonly directory?: string;
  readonly aws?: Omit<AwsProgramOptions, "stackName">;
}

export interface PulumiProgramFiles {
  readonly directory: string;
  readonly projectName: string;
  readonly stackName: string;
  readonly pulumiYaml: string;
  readonly indexTs: string;
  readonly planJson: string;
}

/** Renders a path-independent Pulumi project from a provider-neutral plan. */
export function renderPulumiProgram(
  plan: DeploymentPlan,
  options: PulumiProgramOptions = {},
): PulumiProgramFiles {
  const snapshot = snapshotPlan(plan);
  const stackName = identity(options.stackName ?? DEFAULT_STACK, "stackName");
  const projectName = identity(options.projectName ?? snapshot.application.id, "projectName");
  const directory = resolve(
    options.projectRoot ?? process.cwd(),
    options.directory ?? DEFAULT_DIRECTORY,
  );
  const planJson = `${canonicalJson(snapshot)}\n`;
  return Object.freeze({
    directory,
    projectName,
    stackName,
    pulumiYaml: `name: ${projectName}\nruntime: nodejs\nmain: .\ndescription: ZSys deterministic deployment program\n`,
    indexTs: renderIndex(snapshot, stackName),
    planJson,
  });
}

/** Writes only the deterministic Pulumi project files and returns their contents. */
export async function writePulumiProgram(
  plan: DeploymentPlan,
  options: PulumiProgramOptions = {},
): Promise<PulumiProgramFiles> {
  const files = renderPulumiProgram(plan, options);
  await Promise.all([
    writeProjectFile(join(files.directory, "Pulumi.yaml"), files.pulumiYaml),
    writeIfChanged(join(files.directory, "index.ts"), files.indexTs),
    writeIfChanged(join(files.directory, "plan.json"), files.planJson),
  ]);
  return files;
}

/** Creates the same plan-only resource tree for Pulumi Automation API inline use. */
export function createPulumiProgram(
  plan: DeploymentPlan,
  options: PulumiProgramOptions = {},
): PulumiFn {
  const snapshot = snapshotPlan(plan);
  const stackName = identity(options.stackName ?? DEFAULT_STACK, "stackName");
  return async () => {
    const resources = createAwsPulumiResources(snapshot, { ...options.aws, stackName });
    return {
      graphHash: snapshot.graphHash,
      resourceCount: 9 + (resources.policy === undefined ? 0 : 1),
      endpoint: pulumi.interpolate`http://${resources.service.loadBalancer.dnsName}`,
      bucketName: resources.buckets.buckets[0]?.name,
      queueUrl: resources.jobs.queues[0]?.worker.queueUrl,
      eventBusName: resources.events.eventBusName,
      cacheUrl: resources.caches.caches[0]?.url,
      logGroupName: resources.service.logGroup.name,
    };
  };
}

export const createInlinePulumiProgram = createPulumiProgram;

function renderIndex(plan: DeploymentPlan, stackName: string): string {
  return `import { createAwsPulumiResources } from "@zsys/deploy-pulumi";

const plan = ${canonicalJson(plan)} as const;
const stackName = ${JSON.stringify(stackName)};
const resources = createAwsPulumiResources(plan, { stackName });
export const endpoint = resources.service.loadBalancer.dnsName.apply((value) => \`http://\${value}\`);

export const graphHash = plan.graphHash;
export const zsysPulumiProgramVersion = ${PULUMI_PROGRAM_VERSION};
`;
}

async function writeIfChanged(filePath: string, content: string): Promise<void> {
  const next = Buffer.from(content, "utf8");
  try {
    if ((await readFile(filePath)).equals(next)) return;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, next);
}

async function writeProjectFile(filePath: string, content: string): Promise<void> {
  try {
    const existing = await readFile(filePath, "utf8");
    if (existing.split("\n").some((line) => line.startsWith("backend:"))) return;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  await writeIfChanged(filePath, content);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
