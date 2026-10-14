/** Composes explicit deployment/provider source and grouped task-fixture patches through captured generator services; public creation certification stays unchanged. */
import { join } from "node:path";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { customizeDeploymentManifestEffect } from "./generate-deployment-manifest.js";
import { replaceOnceEffect } from "./generate-files-utilities.js";
import type { CreateOptions } from "./options.js";

/**
 * Applies only explicit deployment and jobs flags, retaining concrete template dependency versions.
 * @param root - Absolute project or owned resource root.
 * @param options - Explicit options retaining existing defaults.
 * @returns Completion after generated deployment/provider source and manifest fields match explicit flags.
 */
export const customizeDeploymentEffect = Effect.fn("ProjectFiles.customizeDeployment")(
  function* (root: string, options: CreateOptions) {
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
    yield* replaceOnceEffect(configPath, "// relkit:create:deployment-imports", imports);
    yield* replaceOnceEffect(
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
    yield* customizeTaskFixtureEffect(root, options);

    yield* customizeDeploymentManifestEffect(root, options);
  },
  (effect) => observeExecution("generator", "generation.deployment", effect),
);

/**
 * Adjusts the tasks fixture to the selected supported jobs adapter.
 * @param root - Absolute project or owned resource root.
 * @param options - Explicit options retaining existing defaults.
 * @returns Completion after task/job examples match the selected provider's supported operations.
 */
export const customizeTaskFixtureEffect = Effect.fn("ProjectFiles.customizeTasks")(
  function* (root: string, options: CreateOptions) {
    if (options.jobs === undefined || options.jobs === "inngest-docker") return;
    const taskPath = join(root, "src/services/orders/tasks/export-orders.task.ts");
    const jobPath = join(root, "src/services/orders/jobs/export-orders.job.ts");
    if (options.jobs === "effect-mq-docker")
      yield* replaceOnceEffect(taskPath, 'execution: "durable"', 'execution: "retryable"');
    yield* replaceOnceEffect(
      taskPath,
      "  progress: z.object({ completed: z.number().int().nonnegative() }),\n",
      "",
    );
    yield* replaceOnceEffect(taskPath, "    await context.progress.emit({ completed: 0 });\n", "");
    yield* replaceOnceEffect(
      taskPath,
      "    await context.progress.emit({ completed: orderIds.length });\n",
      "",
    );
    yield* replaceOnceEffect(
      jobPath,
      '    operations: ["trigger", "get", "list", "watch"],',
      '    operations: ["trigger"],',
    );
    yield* replaceOnceEffect(
      jobPath,
      '    fields: ["status", "progress", "output"],',
      '    fields: ["status", "output"],',
    );
  },
  (effect) => observeExecution("generator", "generation.customizeTasks", effect),
);
