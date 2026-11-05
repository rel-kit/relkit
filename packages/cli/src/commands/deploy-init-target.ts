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
import { railwayFiles, type DeployInitFile } from "./deploy-init-railway.js";
import { vercelFiles } from "./deploy-init-vercel.js";
import { vercelCronPlan } from "./deploy-init-vercel-crons.js";

/** Targets `deploy init` accepts, and the ones announced for later sections. */
const PULUMI_TARGETS = new Set(["aws"]);
const PLATFORM_TARGETS = new Set(["railway", "vercel"]);
const COMING_TARGETS = new Set(["cloudflare"]);
/** Compiled graph `relkit check` writes; the Vercel target reads its schedules. */
const GRAPH_FILE = ".relkit/generated/application.graph.json";

/** A parsed platform-native initialization. */
export interface PlatformInit {
  readonly target: "railway" | "vercel";
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
      `The ${target} target is not available yet; use railway, vercel or aws.`,
    );
  if (!PLATFORM_TARGETS.has(target))
    throw new DeployCommandError(
      "RELKIT_DEPLOY_USAGE",
      `Unknown deploy target: ${target}. Use railway, vercel or aws.`,
    );
  const platform = target as PlatformInit["target"];
  let projectRoot: string | undefined;
  // Vercel functions run Node, so the Vercel target always builds the Node server.
  let runtime: RuntimeName = platform === "vercel" ? "node" : "bun";
  let force = false;
  for (let index = 2; index < args.length; index += 1) {
    const argument = args[index]!;
    const value = args[index + 1];
    if (argument === "--project-root" && value !== undefined && !value.startsWith("-")) {
      projectRoot = value;
      index += 1;
    } else if (
      argument === "--runtime" &&
      (value === "node" || (value === "bun" && platform === "railway"))
    ) {
      runtime = value;
      index += 1;
    } else if (argument === "--force") force = true;
    else
      throw new DeployCommandError(
        "RELKIT_DEPLOY_USAGE",
        `relkit deploy init ${platform} does not take ${argument}${argument === "--runtime" ? ` ${value ?? ""}`.trimEnd() : ""}; it accepts --project-root, --runtime ${platform === "vercel" ? "node" : "bun|node"} and --force.`,
      );
  }
  return {
    platform: {
      target: platform,
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
 * Renders a target's files and next steps. The Vercel target derives its cron entries from the
 * schedules in the graph `relkit check` last wrote.
 * @param root - Project root.
 * @param init - Parsed platform initialization.
 * @returns Files, next steps and the target's display name.
 * @throws DeployCommandError when the Vercel target finds no compiled graph.
 */
const platformFiles = Effect.fn("Cli.deployInitFiles")(function* (
  root: string,
  init: PlatformInit,
) {
  if (init.target === "railway")
    return {
      label: "Railway",
      files: railwayFiles(init.runtime),
      nextSteps: [
        "Create a Railway project with a Postgres database and an empty service (railway init, railway add --database postgres, railway add --service web).",
        "Set DATABASE_URL=${{Postgres.DATABASE_URL}} on the service, generate a domain, then run railway up --service web.",
        "For CI, add the RAILWAY_TOKEN secret and the RAILWAY_SERVICE variable in GitHub; the workflow deploys every push to main.",
      ],
    };
  const graph = yield* cliPromise("deploy.init.graph", () =>
    readFile(join(root, GRAPH_FILE), "utf8").catch(() => undefined),
  );
  if (graph === undefined)
    return yield* new DeployCommandError(
      "RELKIT_DEPLOY_USAGE",
      `relkit deploy init vercel reads the schedules from ${GRAPH_FILE}; run relkit check first.`,
    );
  const cron = yield* Effect.try({
    try: () => vercelCronPlan(graph),
    catch: () =>
      new DeployCommandError(
        "RELKIT_DEPLOY_USAGE",
        `${GRAPH_FILE} is not valid JSON; run relkit check again.`,
      ),
  });
  return {
    label: "Vercel",
    files: vercelFiles(cron) satisfies readonly DeployInitFile[],
    nextSteps: [
      "Create a Postgres database the functions can reach (Vercel Marketplace or any provider) and select it for jobs and events: relkit add jobs --provider postgres, relkit add events --provider postgres.",
      "Run vercel link, then set DATABASE_URL and CRON_SECRET (16 characters or more) with vercel env add, and deploy with vercel deploy --prod.",
      "For CI, add the VERCEL_TOKEN secret and the VERCEL_ORG_ID and VERCEL_PROJECT_ID variables in GitHub; the workflow deploys every push to main.",
      ...cron.fallbacks.map(
        (fallback) =>
          `Schedule ${fallback.job}/${fallback.schedule} (${fallback.reason}) wakes the deployment every minute, which needs a Vercel plan with per-minute cron jobs.`,
      ),
    ],
  };
});
