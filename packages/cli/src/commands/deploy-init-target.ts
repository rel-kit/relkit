/**
 * Routes `relkit deploy init <target>`. Platform targets without a maintained Pulumi provider
 * write their native configuration and a CI workflow and change no cloud resource; `aws` (and a
 * bare `init`) keeps initializing the Pulumi stack.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Effect } from "effect";
import type { RuntimeName } from "relkit/runtime";
import { cliPromise } from "../cli-errors.js";
import { DeployCommandError } from "./deploy-support.js";
import type { DeployExecutionResult } from "./deploy-support.types.js";
import { railwayFiles } from "./deploy-init-railway.js";

/** Targets `deploy init` accepts, and the ones announced for later sections. */
const PULUMI_TARGETS = new Set(["aws"]);
const COMING_TARGETS = new Set(["vercel", "cloudflare"]);

/** A parsed platform-native initialization. */
export interface PlatformInit {
  readonly target: "railway";
  readonly projectRoot?: string;
  readonly runtime: RuntimeName;
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
  if (COMING_TARGETS.has(target))
    throw new DeployCommandError(
      "RELKIT_DEPLOY_USAGE",
      `The ${target} target is not available yet; use railway or aws.`,
    );
  if (target !== "railway")
    throw new DeployCommandError(
      "RELKIT_DEPLOY_USAGE",
      `Unknown deploy target: ${target}. Use railway or aws.`,
    );
  let projectRoot: string | undefined;
  let runtime: RuntimeName = "bun";
  let force = false;
  for (let index = 2; index < args.length; index += 1) {
    const argument = args[index]!;
    const value = args[index + 1];
    if (argument === "--project-root" && value !== undefined && !value.startsWith("-")) {
      projectRoot = value;
      index += 1;
    } else if (argument === "--runtime" && (value === "bun" || value === "node")) {
      runtime = value;
      index += 1;
    } else if (argument === "--force") force = true;
    else
      throw new DeployCommandError(
        "RELKIT_DEPLOY_USAGE",
        `relkit deploy init railway does not take ${argument}; it accepts --project-root, --runtime bun|node and --force.`,
      );
  }
  return {
    platform: { target, runtime, force, ...(projectRoot === undefined ? {} : { projectRoot }) },
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
  const files = railwayFiles(init.runtime);
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
  const nextSteps = [
    "Create a Railway project with a Postgres database and an empty service (railway init, railway add --database postgres, railway add --service web).",
    "Set DATABASE_URL=${{Postgres.DATABASE_URL}} on the service, generate a domain, then run railway up --service web.",
    "For CI, add the RAILWAY_TOKEN secret and the RAILWAY_SERVICE variable in GitHub; the workflow deploys every push to main.",
  ];
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
      `Railway deploy files (${init.runtime} runtime); no cloud resource was changed:`,
      ...report.map((file) => `  ${file.status.padEnd(9)} ${file.path}`),
      "Next:",
      ...nextSteps.map((step) => `  - ${step}`),
    ].join("\n"),
  } satisfies DeployExecutionResult;
});
