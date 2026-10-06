import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Schema, type Context } from "effect";
import { runExecutionPromiseWith } from "@relkit/contracts/operation";
import { applyScaffoldPlan, generateProject, type GenerateCommandResult } from "create-relkit";
import { runCli } from "./main.js";
import { loadCreateRelkitEffect, type CliCommandContext } from "./main-support.js";
import {
  ContributorWorkspace,
  contributorWorkspaceLayer,
} from "./contributor-workspace.service.js";
import { ContributorCreateOptions } from "./contributor.schemas.js";
import { CliProcess } from "./services/process.service.js";
import { cliOriginalError } from "./cli-errors.js";
import { contributorCallback } from "./contributor-callback.js";
import { observeCli, runCliEffect } from "./cli-runtime.js";
import { isJsonMode } from "./cli-effect-runtime.js";

const root = resolve(import.meta.dir, "../../..");
const cli = fileURLToPath(import.meta.url);

/**
 * Rewrites contributor application links while preserving unrelated dependency versions.
 * @param projectRoot - Contributor application directory.
 * @returns Sorted linked dependency names after the manifest write settles.
 */
export function useWorkspaceDependencies(projectRoot: string): Promise<string[]> {
  return runCliEffect(
    Effect.flatMap(ContributorWorkspace, (service) => service.rewrite(projectRoot)),
    contributorWorkspaceLayer(root),
  );
}

/**
 * Registers workspace links serially before the application's install command.
 * @param projectRoot - Application root receiving the links.
 * @param signal - Optional caller cancellation.
 * @returns The first failed link command or existing successful status.
 */
export function prepareWorkspaceLinks(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GenerateCommandResult> {
  return runCliEffect(
    Effect.flatMap(ContributorWorkspace, (service) => service.prepare(projectRoot)),
    contributorWorkspaceLayer(root),
    signal,
  );
}

/**
 * Runs one generator-owned command through captured contributor authorities.
 * @param command - Literal executable vector.
 * @param cwd - Command working directory.
 * @returns Captured output; installs register links before running.
 */
const localCommandEffect = Effect.fn("Contributor.command")(
  function* (command: readonly string[], cwd: string) {
    const workspaces = yield* ContributorWorkspace;
    const processes = yield* CliProcess;
    if (command[0] === process.execPath && command[1] === "install") {
      const prepared = yield* workspaces.prepare(cwd);
      if (prepared.exitCode !== 0) return prepared;
    }
    const actual = command[0] === cli ? [process.execPath, ...command] : command;
    return yield* processes.run({
      command: actual[0]!,
      args: actual.slice(1),
      cwd,
      maximumOutputBytes: Number.MAX_SAFE_INTEGER,
    });
  },
  (effect) => observeCli("contributor.command", effect),
);

/**
 * Binds generator native callbacks to the existing contributor owner.
 * @param context - Services captured from that invocation's lifetime.
 * @returns A Promise callback acquiring no second service graph.
 */
function commandRunner(context: Context.Context<ContributorWorkspace | CliProcess>) {
  return (command: readonly string[], cwd: string, signal?: AbortSignal) =>
    runExecutionPromiseWith(
      context,
      localCommandEffect(command, cwd).pipe(Effect.mapError(cliOriginalError)),
      signal === undefined ? undefined : { signal },
    );
}

/**
 * Runs the existing contributor CLI with one workspace/process graph.
 * @param argv - Literal arguments, defaulting to the native argv.
 * @returns The existing CLI exit status, preserving dev interruption presentation.
 */
export function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runCliEffect(
    Effect.gen(function* () {
      const owner = yield* Effect.context<ContributorWorkspace | CliProcess>();
      const runner = commandRunner(owner);
      const dev = argv.find((argument) => !argument.startsWith("-")) === "dev";
      return yield* contributorCallback("contributor.cli", (signal) =>
        runCli(argv, {
          signal,
          ...(dev
            ? {
                io: {
                  stdout: (line: string) => process.stdout.write(`${line}\n`),
                  stderr: (line: string) => {
                    if (!line.startsWith("RELKIT_INTERRUPTED:")) process.stderr.write(`${line}\n`);
                  },
                },
              }
            : {}),
          loadCreateRelkit: async () => ({
            ...(await runExecutionPromiseWith(owner, loadCreateRelkitEffect)),
            generateProject: (options: unknown, context: CliCommandContext) =>
              generateProject(Schema.decodeUnknownSync(ContributorCreateOptions)(options), {
                ...context,
                bunExecutable: process.execPath,
                relkitExecutable: cli,
                commandRunner: runner,
              }),
            applyScaffoldPlan: (plan, context) =>
              applyScaffoldPlan(plan, {
                ...context,
                bunExecutable: process.execPath,
                relkitExecutable: cli,
                commandRunner: runner,
              }),
          }),
        }),
      );
    }).pipe((effect) => observeCli("contributor.main", effect)),
    contributorWorkspaceLayer(root),
    undefined,
    {
      json: isJsonMode(argv),
      io: {
        stdout: (line) => process.stdout.write(`${line}\n`),
        stderr: (line) => process.stderr.write(`${line}\n`),
      },
    },
  );
}

if (import.meta.main) process.exitCode = await main();
