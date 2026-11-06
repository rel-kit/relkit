/**
 * Routes `relkit deploy init <target>`. Platform targets without a maintained Pulumi provider
 * write their native configuration and a CI workflow and change no cloud resource; `aws` (and a
 * bare `init`) keeps initializing the Pulumi stack.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Effect } from "effect";
import type { RuntimeAdapterName } from "relkit/runtime";
import { cliPromise } from "../cli-errors.js";
import { DeployCommandError } from "./deploy-support.js";
import type { DeployExecutionResult } from "./deploy-support.types.js";
import type { DeployTarget } from "./deploy-target.types.js";
import { DEPLOY_TARGETS } from "./deploy-targets.js";

/** Targets `deploy init` hands to the Pulumi stack. */
const PULUMI_TARGETS = new Set(["aws"]);
/** Compiled graph `relkit check` writes; targets that set `needsGraph` read it. */
const GRAPH_FILE = ".relkit/generated/application.graph.json";

/** A parsed platform-native initialization. */
export interface PlatformInit {
  readonly target: string;
  readonly projectRoot?: string;
  readonly runtime: RuntimeAdapterName;
  readonly force: boolean;
}

/**
 * Splits a `deploy` invocation into a platform-native init or the Pulumi arguments.
 * @param args - Arguments after `deploy`.
 * @returns The platform init, or the arguments for the Pulumi command with any `aws` target removed.
 * @throws DeployCommandError for an unknown target or an option the target does not take.
 */
export function selectDeployInit(
  args: readonly string[],
): { readonly platform: PlatformInit } | { readonly pulumiArgs: readonly string[] } {
  const target = args[0] === "init" ? args[1] : undefined;
  if (target === undefined || target.startsWith("-")) return { pulumiArgs: rejectPlatform(args) };
  if (PULUMI_TARGETS.has(target)) return { pulumiArgs: rejectPlatform(["init", ...args.slice(2)]) };
  const platform = DEPLOY_TARGETS.find((candidate) => candidate.id === target);
  if (platform === undefined)
    throw new DeployCommandError(
      "RELKIT_DEPLOY_USAGE",
      `Unknown deploy target: ${target}. Use railway, vercel, cloudflare or aws.`,
    );
  let projectRoot: string | undefined;
  let runtime: RuntimeAdapterName = platform.defaultRuntime;
  let force = false;
  for (let index = 2; index < args.length; index += 1) {
    const argument = args[index]!;
    const value = args[index + 1];
    if (argument === "--project-root" && value !== undefined && !value.startsWith("-")) {
      projectRoot = value;
      index += 1;
    } else if (
      argument === "--runtime" &&
      platform.runtimes.includes(value as RuntimeAdapterName)
    ) {
      runtime = value as RuntimeAdapterName;
      index += 1;
    } else if (argument === "--force") force = true;
    else
      throw new DeployCommandError(
        "RELKIT_DEPLOY_USAGE",
        `relkit deploy init ${platform.id} does not take ${argument}${argument === "--runtime" ? ` ${value ?? ""}`.trimEnd() : ""}; it accepts --project-root, --runtime ${platform.runtimes.join("|")} and --force.`,
      );
  }
  return {
    platform: {
      target: platform.id,
      runtime,
      force,
      ...(projectRoot === undefined ? {} : { projectRoot }),
    },
  };
}

/**
 * Rejects platform-only options on the Pulumi path.
 * @param args - Pulumi command arguments.
 * @returns The same arguments.
 */
function rejectPlatform(args: readonly string[]): readonly string[] {
  const option = args.find((argument) => argument === "--runtime" || argument === "--force");
  if (option !== undefined)
    throw new DeployCommandError(
      "RELKIT_DEPLOY_USAGE",
      `${option} applies to platform targets such as relkit deploy init railway.`,
    );
  return args;
}

/**
 * Writes a platform target's files. Existing identical files are kept; a differing file stops the
 * command before anything is written unless `force` replaces it.
 * @param root - Project root.
 * @param init - Parsed platform initialization.
 * @returns The report of written and unchanged files and the next steps.
 */
export const runPlatformInit = Effect.fn("Cli.deployInitPlatform")(function* (
  root: string,
  init: PlatformInit,
) {
  const { files, nextSteps, label } = yield* platformFiles(root, init);
  const existing = yield* Effect.forEach(files, (file) =>
    cliPromise("deploy.init.read", () =>
      readFile(join(root, file.path), "utf8").catch(() => undefined),
    ),
  );
  const conflicts = files.filter(
    (file, index) => existing[index] !== undefined && existing[index] !== file.content,
  );
  if (conflicts.length > 0 && !init.force)
    return yield* new DeployCommandError(
      "RELKIT_DEPLOY_INIT_CONFLICT",
      `These files exist with different content: ${conflicts.map((file) => file.path).join(", ")}. Review them, then rerun with --force to replace them.`,
    );
  const report: { path: string; status: "created" | "replaced" | "unchanged" }[] = [];
  for (const [index, file] of files.entries()) {
    const before = existing[index];
    if (before === file.content) {
      report.push({ path: file.path, status: "unchanged" });
      continue;
    }
    const path = resolve(root, file.path);
    yield* cliPromise("deploy.init.write", async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.content);
    });
    report.push({ path: file.path, status: before === undefined ? "created" : "replaced" });
  }
  return {
    ok: true,
    value: {
      target: init.target,
      runtime: init.runtime,
      cloudResourcesChanged: false,
      files: report,
      nextSteps,
    },
    human: [
      `${label} deploy files (${init.runtime} runtime); no cloud resource was changed:`,
      ...report.map((file) => `  ${file.status.padEnd(9)} ${file.path}`),
      "Next:",
      ...nextSteps.map((step) => `  - ${step}`),
    ].join("\n"),
  } satisfies DeployExecutionResult;
});

/**
 * Renders a target's files and next steps through its `DeployTarget` implementation.
 * @param root - Project root.
 * @param init - Parsed platform initialization.
 * @returns Files, next steps and the target's display name.
 * @throws DeployCommandError when the target needs the compiled graph and finds none, or rejects
 *   the input.
 */
const platformFiles = Effect.fn("Cli.deployInitFiles")(function* (
  root: string,
  init: PlatformInit,
) {
  const target = DEPLOY_TARGETS.find((candidate) => candidate.id === init.target) as DeployTarget;
  const graph = target.needsGraph
    ? yield* cliPromise("deploy.init.graph", () =>
        readFile(join(root, GRAPH_FILE), "utf8").catch(() => undefined),
      )
    : undefined;
  const plan = yield* Effect.tryPromise({
    try: () => target.plan({ root, runtime: init.runtime, graph }),
    catch: (error) =>
      error instanceof DeployCommandError
        ? error
        : new DeployCommandError(
            "RELKIT_DEPLOY_USAGE",
            error instanceof Error ? error.message : String(error),
          ),
  });
  return { label: target.label, files: plan.files, nextSteps: plan.nextSteps };
});
