import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CreateOptions } from "./options.js";
import { CreateValidationError, validateCreateOptions } from "./validate.js";
import {
  injectGenerateFailure,
  generationError,
  resolveZsysExecutable,
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
import { createGenerateNextSteps, type GenerateNextSteps } from "./generate-output.js";

const DIRECTORY_MODE = 0o755;

export interface GenerateCommandResult {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

export type GenerateCommandRunner = (
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<GenerateCommandResult>;

export type GenerateFailurePoint =
  "copy" | "substitute" | "install" | "git" | "doctor" | "check" | "rename";

export interface GenerateProjectContext {
  readonly cwd?: string;
  readonly templateRoot?: string;
  readonly commandRunner?: GenerateCommandRunner;
  readonly bunExecutable?: string;
  readonly gitExecutable?: string;
  readonly zsysExecutable?: string;
  readonly signal?: AbortSignal;
  readonly failAt?: (point: GenerateFailurePoint) => void;
}

export interface GenerateProjectResult {
  readonly ok: true;
  readonly command: "create";
  readonly name: string;
  readonly template: CreateOptions["template"];
  readonly cloud: CreateOptions["cloud"];
  readonly deploy: CreateOptions["deploy"];
  readonly destination: string;
  readonly files: readonly string[];
  readonly installed: boolean;
  readonly gitInitialized: boolean;
  readonly nextSteps: GenerateNextSteps;
}

export class GenerateProjectError extends Error {
  readonly exitCode = 1;
  readonly temporaryPath: string | undefined;

  constructor(
    readonly code: string,
    message: string,
    temporaryPath?: string,
  ) {
    super(message);
    this.temporaryPath = temporaryPath;
    this.name = "GenerateProjectError";
  }
}

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
    throw generationError(error, "ZSYS_CREATE_VALIDATION_FAILED");
  }
  throwIfAborted(context.signal);

  const templateRoot = resolveTemplateRoot(context);
  const template = join(templateRoot, options.template);
  let stage: string | undefined;
  let published = false;

  try {
    await requireTemplate(template);
    await mkdir(dirname(validated.destination), { recursive: true, mode: DIRECTORY_MODE });
    const staged = await mkdtemp(
      join(dirname(validated.destination), `.${basename(validated.destination)}-zsys-`),
    );
    stage = staged;

    injectGenerateFailure(context, "copy");
    await copyTemplate(template, staged);
    injectGenerateFailure(context, "substitute");
    await customizeProject(staged, options);
    await requireFiles(staged, [
      "package.json",
      "zsys.config.ts",
      "src/app.ts",
      "src/env.ts",
      ".env.example",
    ]);

    if (options.install) {
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
    if (gitInitialized) await runProjectStep(context, [git, "init"], staged, "git", "git");

    const zsys = await resolveZsysExecutable(context, staged);
    const deploymentCheck = options.cloud === "none" || options.deploy === "none";
    await runProjectStep(
      context,
      [zsys, "doctor", "--project-root", staged, ...(deploymentCheck ? ["--no-pulumi"] : [])],
      staged,
      "doctor",
      "doctor",
    );
    await runProjectStep(
      context,
      [zsys, "check", "--project-root", staged],
      staged,
      "check",
      "check",
    );
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
      nextSteps: createGenerateNextSteps(options, validated.destination, context.cwd),
    });
  } catch (error) {
    const cleanup = published
      ? undefined
      : await cleanupStagedProject(stage, validated.destination);
    throw generationError(error, "ZSYS_CREATE_FAILED", cleanup);
  }
}

function resolveTemplateRoot(context: GenerateProjectContext): string {
  if (context.templateRoot !== undefined) return resolve(context.templateRoot);
  const packaged = fileURLToPath(new URL("../../../templates/default/v1", import.meta.url));
  if (existsSync(packaged)) return resolve(packaged);
  return resolve(context.cwd ?? process.cwd(), "templates/default/v1");
}
