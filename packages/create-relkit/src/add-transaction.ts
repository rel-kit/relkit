import { access, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { resolveRelkitExecutable } from "./generate-process.js";
import {
  ADD_FAILURE_CODES,
  AddScaffoldError,
  type AddResult,
  type ScaffoldPlan,
  type ScaffoldVerification,
} from "./add-types.js";
import {
  applyFileOperations,
  restoreFiles,
  snapshotFiles,
  validateOperationActions,
} from "./add-transaction-files.js";

export interface AddCommandResult {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

export interface ApplyScaffoldContext {
  readonly commandRunner?: (
    command: readonly string[],
    cwd: string,
    signal?: AbortSignal,
  ) => Promise<AddCommandResult>;
  readonly bunExecutable?: string;
  readonly relkitExecutable?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (message: string) => void;
  readonly deferVerification?: boolean;
}

/** Applies a complete plan and restores every touched project path on failure. */
export async function applyScaffoldPlan(
  plan: ScaffoldPlan,
  context: ApplyScaffoldContext = {},
): Promise<AddResult> {
  throwIfAborted(context.signal);
  await validateOperationActions(plan.projectRoot, plan.operations);
  const packages = Object.keys(plan.dependencies).sort();
  const snapshots = await snapshotFiles(plan.projectRoot, plan.operations, packages.length > 0);
  const createdDirectories = new Set<string>();
  // Dev watches this process-scoped marker until installation/checking or rollback finishes.
  const marker = join(plan.projectRoot, `.relkit-scaffold-${process.pid}-${randomUUID()}.tmp`);
  await writeFile(marker, "", { flag: "wx" });
  try {
    await applyFileOperations(plan.projectRoot, plan.operations, createdDirectories);
    let verification: ScaffoldVerification;
    if (context.deferVerification) {
      verification = {
        status: "skipped",
        reason: "Validation is deferred until project creation finishes.",
        command: "bun run check",
      };
    } else if (packages.length > 0 && plan.request.install) {
      context.onProgress?.("Installing dependencies...");
      await run(
        context,
        [context.bunExecutable ?? process.execPath, "install"],
        ADD_FAILURE_CODES.installation,
        plan.projectRoot,
      );
      verification = await check(plan, context);
    } else if (packages.length > 0 && !(await packagesAvailable(plan.projectRoot, packages))) {
      verification = {
        status: "skipped",
        reason: `New packages are not installed: ${packages.join(", ")}`,
        command: "bun run check",
      };
    } else {
      verification = await check(plan, context);
    }
    return Object.freeze({
      ok: true,
      command: "add",
      kind: plan.request.kind,
      projectRoot: plan.projectRoot,
      createdFiles: Object.freeze(
        plan.operations.filter((item) => item.action === "create").map((item) => item.path),
      ),
      updatedFiles: Object.freeze(
        plan.operations.filter((item) => item.action === "update").map((item) => item.path),
      ),
      installedPackages: Object.freeze(plan.request.install ? packages : []),
      warnings: plan.warnings,
      verification,
      nextSteps: Object.freeze([
        ...plan.nextSteps,
        ...(verification.status === "skipped" && !context.deferVerification
          ? ["bun install", verification.command]
          : []),
      ]),
    });
  } catch (error) {
    await restoreFiles(snapshots, createdDirectories);
    if (context.signal?.aborted) {
      throw new AddScaffoldError(ADD_FAILURE_CODES.cancellation, "Scaffolding was cancelled.");
    }
    if (error instanceof AddScaffoldError) throw error;
    throw new AddScaffoldError(ADD_FAILURE_CODES.validation, message(error));
  } finally {
    await rm(marker, { force: true });
  }
}

async function check(
  plan: ScaffoldPlan,
  context: ApplyScaffoldContext,
): Promise<ScaffoldVerification> {
  context.onProgress?.("Checking project...");
  const executable = await resolveRelkitExecutable(context, plan.projectRoot);
  await run(
    context,
    [executable, "check", "--project-root", plan.projectRoot],
    ADD_FAILURE_CODES.validation,
    plan.projectRoot,
  );
  return { status: "passed", command: "bun run check" };
}

async function run(
  context: ApplyScaffoldContext,
  command: readonly string[],
  code: typeof ADD_FAILURE_CODES.installation | typeof ADD_FAILURE_CODES.validation,
  cwd: string,
): Promise<void> {
  throwIfAborted(context.signal);
  const result = context.commandRunner
    ? await context.commandRunner(command, cwd, context.signal)
    : await defaultRunner(command, cwd, context.signal);
  if (result.exitCode !== 0) {
    throw new AddScaffoldError(
      code,
      result.stderr?.trim() || result.stdout?.trim() || `${command[0]} failed.`,
    );
  }
  throwIfAborted(context.signal);
}

async function defaultRunner(
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<AddCommandResult> {
  const process = Bun.spawn([...command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    ...(signal ? { signal } : {}),
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function packagesAvailable(root: string, packages: readonly string[]): Promise<boolean> {
  const results = await Promise.all(
    packages.map((name) =>
      access(join(root, "node_modules", ...name.split("/"))).then(
        () => true,
        () => false,
      ),
    ),
  );
  return results.every(Boolean);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AddScaffoldError(ADD_FAILURE_CODES.cancellation, "Scaffolding was cancelled.");
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
