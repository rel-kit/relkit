import { access, chmod, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { GenerateProjectError } from "./generate-types.js";
import type { CreateOptions } from "./options.js";
export {
  EXAMPLE_PATH_PREFIXES,
  cleanupStagedProject,
  listProjectFiles,
  projectId,
  removeExamples,
  replaceOnce,
  requireFiles,
  requireTemplate,
  type StageCleanupResult,
} from "./generate-files-utilities.js";
import {
  EXAMPLE_PATH_PREFIXES,
  compareNames,
  listProjectFiles,
  projectId,
  removeExamples,
  replaceOnce,
} from "./generate-files-utilities.js";

const FILE_MODE = 0o644;
const DIRECTORY_MODE = 0o755;
export async function copyTemplate(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(target, DIRECTORY_MODE);
  const entries = (await readdir(source, { withFileTypes: true })).sort(compareNames);
  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(target, entry.name === "gitignore" ? ".gitignore" : entry.name);
    if (entry.isDirectory()) await copyTemplate(from, to);
    else if (entry.isFile()) {
      await writeFile(to, await readFile(from), { mode: FILE_MODE });
      await chmod(to, FILE_MODE);
    } else
      throw new GenerateProjectError(
        "RELKIT_CREATE_TEMPLATE_INVALID",
        "Template contains an unsupported entry.",
      );
  }
}

export async function customizeProject(root: string, options: CreateOptions): Promise<void> {
  await replaceOnce(
    join(root, "package.json"),
    '"name": "my-app"',
    `"name": ${JSON.stringify(options.name)}`,
  );
  await replaceOnce(join(root, "README.md"), "# my-app", `# ${options.name}`);
  await replaceOnce(
    join(root, "relkit.config.ts"),
    "export default defineApp({",
    `export default defineApp({\n  id: ${JSON.stringify(projectId(options.name))},`,
  );
  await customizeDeployment(root, options);
  if (!options.examples) await removeExamples(root);
}

async function customizeDeployment(root: string, options: CreateOptions): Promise<void> {
  const configPath = join(root, "relkit.config.ts");
  const imports = [
    ...(options.cloud === "aws" ? ['import "@relkit/aws";'] : []),
    ...(options.deploy === "pulumi" ? ['import "@relkit/pulumi";'] : []),
    ...(options.jobs === undefined ? [] : ['import { docker } from "@relkit/docker";']),
    ...(options.jobs === "inngest-docker" ? ['import { inngest } from "@relkit/inngest";'] : []),
    ...(options.jobs === "effect-mq-docker"
      ? ['import { effectMq } from "@relkit/effect-mq";']
      : []),
    ...(options.jobs === "trigger-docker" ? ['import { trigger } from "@relkit/trigger";'] : []),
  ].join("\n");
  await replaceOnce(configPath, "// relkit:create:deployment-imports", imports);
  await replaceOnce(
    configPath,
    "  // relkit:create:deployment",
    [
      options.cloud === "aws" && options.deploy === "pulumi"
        ? '  deployment: { engine: "pulumi", host: "aws" },'
        : "",
      options.jobs === "inngest-docker" ? "  jobs: { default: docker(inngest()) }," : "",
      options.jobs === "effect-mq-docker" ? "  jobs: { default: docker(effectMq()) }," : "",
      options.jobs === "trigger-docker" ? "  jobs: { default: docker(trigger()) }," : "",
      options.jobs === undefined ? "" : '  defaults: { jobs: "default" },',
    ]
      .filter(Boolean)
      .join("\n"),
  );
  await customizeTaskFixture(root, options);

  const manifestPath = join(root, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  const version = manifest.dependencies["@relkit/app"]!;
  if (options.cloud === "aws") manifest.dependencies["@relkit/aws"] = version;
  if (options.deploy === "pulumi") manifest.dependencies["@relkit/pulumi"] = version;
  if (options.jobs !== undefined) {
    manifest.dependencies["@relkit/docker"] = version;
    manifest.dependencies[`@relkit/${options.jobs.replace(/-docker$/u, "")}`] = version;
  }
  if (options.cloud === "aws" && options.deploy === "pulumi") {
    manifest.scripts["deploy:preview"] = "relkit deploy preview";
    manifest.scripts.deploy = "relkit deploy up";
  }
  manifest.scripts = sorted(manifest.scripts);
  manifest.dependencies = sorted(manifest.dependencies);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await chmod(manifestPath, FILE_MODE);
}

async function customizeTaskFixture(root: string, options: CreateOptions): Promise<void> {
  if (options.jobs === undefined || options.jobs === "inngest-docker") return;
  const taskPath = join(root, "src/orders/tasks/export-orders.task.ts");
  const jobPath = join(root, "src/orders/jobs/export-orders.job.ts");
  if (options.jobs === "effect-mq-docker")
    await replaceOnce(taskPath, 'execution: "durable"', 'execution: "retryable"');
  await replaceOnce(
    taskPath,
    "  progress: z.object({ completed: z.number().int().nonnegative() }),\n",
    "",
  );
  await replaceOnce(taskPath, "    await context.progress.emit({ completed: 0 });\n", "");
  await replaceOnce(
    taskPath,
    "    await context.progress.emit({ completed: orderIds.length });\n",
    "",
  );
  await replaceOnce(
    jobPath,
    '    operations: ["trigger", "get", "list", "watch"],',
    '    operations: ["trigger"],',
  );
  await replaceOnce(
    jobPath,
    '    fields: ["status", "progress", "output"],',
    '    fields: ["status", "output"],',
  );
}

function sorted(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}
