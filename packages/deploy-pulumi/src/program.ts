import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import type { DeploymentPlan } from "@relkit/deploy";
import type { PulumiFn } from "@pulumi/pulumi/automation";
import { identity, snapshotPlan } from "./program-support.js";
import { materializeDeploymentOperations } from "./materialization.js";
import { executeDeploymentOperations } from "./operation-executor.js";

export const PULUMI_PROGRAM_VERSION = 1 as const;
const DEFAULT_STACK = "development";
const DEFAULT_DIRECTORY = ".relkit/generated/pulumi";

export interface PulumiProgramOptions {
  readonly stackName?: string;
  readonly projectName?: string;
  readonly projectRoot?: string;
  readonly directory?: string;
  readonly integrations?: readonly unknown[];
  readonly integrationImports?: readonly PulumiIntegrationImport[];
}

export interface PulumiIntegrationImport {
  readonly integrationId: string;
  readonly role: "engine" | "host" | "infrastructure" | "access";
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
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
    pulumiYaml: `name: ${projectName}\nruntime: nodejs\nmain: .\ndescription: RelKit deterministic deployment program\n`,
    indexTs: renderIndex(snapshot, stackName, requiredImports(options.integrationImports)),
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
    const result = materializePulumiDeployment(snapshot, {
      stackName,
      integrations: requiredIntegrations(options.integrations),
    });
    return {
      graphHash: snapshot.graphHash,
      resourceCount: result.resourceCount,
      ...result.outputs,
    };
  };
}

export const createInlinePulumiProgram = createPulumiProgram;

export function materializePulumiDeployment(
  plan: DeploymentPlan,
  options: { readonly stackName: string; readonly integrations: readonly unknown[] },
) {
  return executeDeploymentOperations(
    materializeDeploymentOperations(plan, {
      stackName: options.stackName,
      integrations: options.integrations,
    }),
  );
}

function renderIndex(
  plan: DeploymentPlan,
  stackName: string,
  imports: readonly PulumiIntegrationImport[],
): string {
  const statements = imports.map(
    (entry, index) =>
      `import { deploymentIntegration as integration${index} } from ${JSON.stringify(specifier(entry))};`,
  );
  return `import { materializePulumiDeployment } from "@relkit/deploy-pulumi";
${statements.join("\n")}

const plan = ${canonicalJson(plan)} as const;
const stackName = ${JSON.stringify(stackName)};
const result = materializePulumiDeployment(plan, {
  stackName,
  integrations: [${imports.map((_, index) => `integration${index}`).join(", ")}],
});
export const endpoint = result.outputs.endpoint;
export const registryUrl = result.outputs.registryUrl;
export const logGroupName = result.outputs.logGroupName;

export const graphHash = plan.graphHash;
export const resourceCount = result.resourceCount;
export const relkitPulumiProgramVersion = ${PULUMI_PROGRAM_VERSION};
`;
}

function requiredIntegrations(value: readonly unknown[] | undefined): readonly unknown[] {
  if (value === undefined || value.length === 0)
    throw new TypeError("Pulumi deployment integrations are required.");
  return value;
}

function requiredImports(
  value: readonly PulumiIntegrationImport[] | undefined,
): readonly PulumiIntegrationImport[] {
  if (value === undefined || value.length === 0)
    throw new TypeError("Pulumi integration imports are required.");
  return [...value].sort((left, right) =>
    `${left.role}\0${left.integrationId}`.localeCompare(`${right.role}\0${right.integrationId}`),
  );
}

function specifier(entry: PulumiIntegrationImport): string {
  if (
    !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(entry.packageName) ||
    !/^\.\/[a-z0-9._/-]+$/i.test(entry.exportName) ||
    entry.exportName.split("/").includes("..")
  )
    throw new TypeError("Pulumi integration import is invalid.");
  return `${entry.packageName}/${entry.exportName.slice(2)}`;
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
