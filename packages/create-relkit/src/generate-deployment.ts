import { join } from "node:path";
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GenerateProjectError } from "./generate-types.js";
import { domainError, domainTry } from "./generator-errors.js";
import { TemplateManifest, JsonObject } from "./project-manifest.schemas.js";
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

    const manifestPath = join(root, "package.json");
    const source = yield* (yield* GeneratorFileSystem).readText(manifestPath);
    const fs = yield* GeneratorFileSystem;
    const parsed = yield* domainTry(() => JSON.parse(source) as unknown);
    const decoded = yield* Schema.decodeUnknownEffect(TemplateManifest)(parsed).pipe(
      Effect.mapError(domainError),
    );
    const original = yield* Schema.decodeUnknownEffect(JsonObject)(parsed).pipe(
      Effect.mapError(domainError),
    );
    const manifest = {
      ...original,
      ...decoded,
      dependencies: { ...decoded.dependencies },
      scripts: { ...decoded.scripts },
    };
    const version = manifest.dependencies["@relkit/app"];
    if (version === undefined)
      return yield* Effect.fail(
        domainError(
          new GenerateProjectError(
            "RELKIT_CREATE_TEMPLATE_INVALID",
            "Template has no @relkit/app dependency.",
          ),
        ),
      );
    if (options.cloud === "aws") manifest.dependencies["@relkit/aws"] = version;
    if (options.deploy === "pulumi") manifest.dependencies["@relkit/pulumi"] = version;
    if (options.jobs !== undefined) {
      manifest.dependencies["@relkit/docker"] = version;
      manifest.dependencies["@relkit/local"] = version;
      manifest.dependencies[`@relkit/${options.jobs.replace(/-docker$/u, "")}`] = version;
    }
    if (options.cloud === "aws" && options.deploy === "pulumi") {
      manifest.scripts["deploy:preview"] = "relkit deploy preview";
      manifest.scripts.deploy = "relkit deploy up";
    }
    manifest.scripts = sorted(manifest.scripts);
    manifest.dependencies = sorted(manifest.dependencies);
    yield* fs.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    yield* fs.chmod(manifestPath, 0o644);
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
    const taskPath = join(root, "src/orders/tasks/export-orders.task.ts");
    const jobPath = join(root, "src/orders/jobs/export-orders.job.ts");
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

/**
 * Sorts owned manifest fields deterministically.
 * @param values - Ordered declarations or argument values.
 * @returns A new manifest string record sorted by key.
 */
function sorted(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}
