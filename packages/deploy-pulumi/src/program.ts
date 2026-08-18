import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalJson } from "@zsys/contracts";
import type { DeploymentPlan } from "@zsys/deploy";
import { ComponentResource, type Inputs, type Resource } from "@pulumi/pulumi";
import type { PulumiFn } from "@pulumi/pulumi/automation";
import {
  entryTags,
  identity,
  requiredTags,
  resourceEntries,
  scopedName,
  snapshotPlan,
} from "./program-support.js";

export const PULUMI_PROGRAM_VERSION = 1 as const;
const DEFAULT_STACK = "development";
const DEFAULT_DIRECTORY = ".zsys/generated/pulumi";

export interface PulumiProgramOptions {
  readonly stackName?: string;
  readonly projectName?: string;
  readonly projectRoot?: string;
  readonly directory?: string;
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
    const tags = requiredTags(snapshot, stackName);
    const root = new ComponentResource(
      "zsys:deployment:application",
      scopedName(stackName, snapshot.application.id),
      { id: snapshot.application.id, tags },
    );
    const entries = resourceEntries(snapshot);
    for (const entry of entries)
      new ComponentResource(
        `zsys:deployment:${entry.kind}`,
        scopedName(stackName, entry.logicalName),
        { ...(entry.value as Inputs), tags: entryTags(entry.value, tags) },
        { parent: root },
      );
    return { graphHash: snapshot.graphHash, resourceCount: entries.length + 1 };
  };
}

export const createInlinePulumiProgram = createPulumiProgram;

function renderIndex(plan: DeploymentPlan, stackName: string): string {
  return `import { ComponentResource, type Inputs, type Resource } from "@pulumi/pulumi";

const plan = ${canonicalJson(plan)} as const;
const stackName = ${JSON.stringify(stackName)};
const tags = ${canonicalJson(requiredTags(plan, stackName))} as const;
const scopedName = (logicalName: string) => {
  const value = [stackName, logicalName].join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return value.replace(/^-+|-+$/g, "") || "resource";
};
const entryTags = (value: Inputs) => ({ ...(value.tags as Record<string, string> | undefined), ...tags });
const add = (kind: string, logicalName: string, value: Inputs, parent: Resource) =>
  new ComponentResource(
    \`zsys:deployment:\${kind}\`,
    scopedName(logicalName),
    { ...value, tags: entryTags(value) },
    { parent },
  );

const application = new ComponentResource(
  "zsys:deployment:application",
  scopedName(plan.application.id),
  { id: plan.application.id, tags },
);
add("http", plan.http.logicalName, plan.http as Inputs, application);
add("observability", plan.observability.logicalName, plan.observability as Inputs, application);
for (const entry of plan.jobs) add("job", entry.logicalName, entry as Inputs, application);
for (const entry of plan.schedules) add("schedule", entry.logicalName, entry as Inputs, application);
for (const entry of plan.events) add("event", entry.logicalName, entry as Inputs, application);
for (const entry of plan.eventTriggers) add("event-trigger", entry.logicalName, entry as Inputs, application);
for (const entry of plan.buckets) add("bucket", entry.logicalName, entry as Inputs, application);
for (const entry of plan.caches) add("cache", entry.logicalName, entry as Inputs, application);
for (const entry of plan.models ?? []) add("model", entry.logicalName, entry as Inputs, application);

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
