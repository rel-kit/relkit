import { mkdir, mkdtemp, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { CreateOptions } from "./options.js";
import { validateCreateOptions } from "./validate.js";
import {
  injectGenerateFailure,
  generationError,
  resolveRelkitExecutable,
  runProjectStep,
  throwIfAborted,
} from "./generate-process.js";
import {
  copyTemplate,
  cleanupStagedProject,
  customizeProject,
  listProjectFiles,
  requireFiles,
  requireTemplate,
} from "./generate-files.js";
import { createGenerateNextSteps } from "./generate-output.js";
import { addToStagedProject } from "./create-additions.js";
import { resolveTemplateRoot } from "./template-root.js";
import { type GenerateProjectContext, type GenerateProjectResult } from "./generate-types.js";

const DIRECTORY_MODE = 0o755;

/** Copies, validates, checks, and atomically publishes one generated project. */
export async function generateProject(
  options: CreateOptions,
  context: GenerateProjectContext = {},
): Promise<GenerateProjectResult> {
  let validated: ReturnType<typeof validateCreateOptions>;
  try {
    validated = validateCreateOptions(
      options,
      context.cwd === undefined ? {} : { cwd: context.cwd },
    );
  } catch (error) {
    throw generationError(error, "RELKIT_CREATE_VALIDATION_FAILED");
  }
  throwIfAborted(context.signal);
  context.onProgress?.(`Creating a new RELKIT app in ${validated.destination}.`);

  const templateRoot = resolveTemplateRoot(context);
  const template = join(templateRoot, options.template);
  let stage: string | undefined;
  let published = false;

  try {
    await requireTemplate(template);
    await mkdir(dirname(validated.destination), { recursive: true, mode: DIRECTORY_MODE });
    const staged = await mkdtemp(
      join(dirname(validated.destination), `.${basename(validated.destination)}-relkit-`),
    );
    stage = staged;

    injectGenerateFailure(context, "copy");
    await copyTemplate(template, staged);
    injectGenerateFailure(context, "substitute");
    await customizeProject(staged, options);
    await requireFiles(staged, [
      "package.json",
      "relkit.config.ts",
      "src/platform/env.ts",
      ".env.example",
      ".gitignore",
    ]);

    const stagedAdditions = await addToStagedProject(staged, context);
    const additions = stagedAdditions.results;

    if (options.install) {
      context.onProgress?.("Installing dependencies...");
      await runProjectStep(
        context,
        [context.bunExecutable ?? process.execPath, "install"],
        staged,
        "install",
        "install",
      );
    }

    const git = context.gitExecutable ?? (context.commandRunner ? "git" : Bun.which("git"));
    const gitInitialized = options.git && git !== null;
    if (gitInitialized) {
      context.onProgress?.("Initializing Git repository...");
      await runProjectStep(context, [git, "init"], staged, "git", "git");
    }

    if (options.install) {
      const relkit = await resolveRelkitExecutable(context, staged);
      const deploymentCheck = options.cloud === "none" || options.deploy === "none";
      context.onProgress?.("Checking generated project...");
      await runProjectStep(
        context,
        [
          relkit,
          "doctor",
          "--project-root",
          staged,
          "--no-ports",
          ...(deploymentCheck ? ["--no-pulumi"] : []),
        ],
        staged,
        "doctor",
        "doctor",
      );
      await runProjectStep(
        context,
        [relkit, "check", "--project-root", staged],
        staged,
        "check",
        "check",
      );
    }
    throwIfAborted(context.signal);
    injectGenerateFailure(context, "rename");
    await rename(staged, validated.destination);
    published = true;

    return Object.freeze({
      ok: true,
      command: "create" as const,
      name: options.name,
      template: options.template,
      cloud: options.cloud,
      deploy: options.deploy,
      destination: validated.destination,
      files: Object.freeze(await listProjectFiles(validated.destination)),
      installed: options.install,
      gitInitialized,
      additions,
      warnings: Object.freeze([
        ...additions.flatMap((addition) => addition.warnings),
        ...(!options.install
          ? [
              {
                code: "validation-skipped",
                message: "Install dependencies, then run bun run check.",
              },
            ]
          : []),
      ]),
      nextSteps: createGenerateNextSteps(options, validated.destination, context.cwd),
    });
  } catch (error) {
    const cleanup = published
      ? undefined
      : await cleanupStagedProject(stage, validated.destination);
    throw generationError(error, "RELKIT_CREATE_FAILED", cleanup);
  }
}
