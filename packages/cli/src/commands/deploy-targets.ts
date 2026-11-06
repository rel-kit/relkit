/**
 * The first-party deploy targets, each an implementation of the public `DeployTarget` contract:
 * Railway (Docker image on Bun or Node), Vercel (Node functions) and Cloudflare (Workers). Every
 * target passes the shared suite in `@relkit/testing/deploy-target-conformance`.
 */
import { Cause, Effect, Exit } from "effect";
import type { RuntimeName } from "relkit/runtime";
import { cloudflareTarget } from "./deploy-init-cloudflare-target.js";
import { railwayFiles } from "./deploy-init-railway.js";
import { vercelCronPlan } from "./deploy-init-vercel-crons.js";
import { vercelFiles } from "./deploy-init-vercel.js";
import { DeployCommandError } from "./deploy-support.js";
import type { DeployTarget, DeployTargetInput } from "./deploy-target.types.js";

export type * from "./deploy-target.types.js";

/** Graph file `relkit check` writes, named in messages. */
const GRAPH_FILE = ".relkit/generated/application.graph.json";

/** Railway: a source Dockerfile, `railway.json` and a deploy workflow. */
export const railwayDeployTarget: DeployTarget = Object.freeze({
  id: "railway",
  label: "Railway",
  runtimes: Object.freeze(["bun", "node"] as const),
  defaultRuntime: "bun",
  needsGraph: false,
  plan: async ({ runtime }: DeployTargetInput) => ({
    files: railwayFiles(runtime as RuntimeName),
    nextSteps: [
      "Create a Railway project with a Postgres database and an empty service (railway init, railway add --database postgres, railway add --service web).",
      "Set DATABASE_URL=${{Postgres.DATABASE_URL}} on the service, generate a domain, then run railway up --service web.",
      "For CI, add the RAILWAY_TOKEN secret and the RAILWAY_SERVICE variable in GitHub; the workflow deploys every push to main.",
    ],
  }),
});

/** Vercel: `vercel.json` with crons from the graph's schedules, the function entry and a workflow. */
export const vercelDeployTarget: DeployTarget = Object.freeze({
  id: "vercel",
  label: "Vercel",
  runtimes: Object.freeze(["node"] as const),
  defaultRuntime: "node",
  needsGraph: true,
  plan: async ({ graph }: DeployTargetInput) => {
    let cron: ReturnType<typeof vercelCronPlan>;
    try {
      cron = vercelCronPlan(requiredGraph(graph, "vercel"));
    } catch (error) {
      if (error instanceof DeployCommandError) throw error;
      throw new DeployCommandError(
        "RELKIT_DEPLOY_USAGE",
        `${GRAPH_FILE} is not valid JSON; run relkit check again.`,
      );
    }
    return {
      files: vercelFiles(cron),
      nextSteps: [
        "Create a Postgres database the functions can reach (Vercel Marketplace or any provider) and select it for jobs and events: relkit add jobs --provider postgres, relkit add events --provider postgres.",
        "Run vercel link, then set DATABASE_URL and CRON_SECRET (16 characters or more) with vercel env add, and deploy with vercel deploy --prod.",
        "For CI, add the VERCEL_TOKEN secret and the VERCEL_ORG_ID and VERCEL_PROJECT_ID variables in GitHub; the workflow deploys every push to main.",
        ...cron.fallbacks.map(
          (fallback) =>
            `Schedule ${fallback.job}/${fallback.schedule} (${fallback.reason}) wakes the deployment every minute, which needs a Vercel plan with per-minute cron jobs.`,
        ),
        "Rerun relkit deploy init vercel after changing schedules; relkit build --target vercel fails while vercel.json's crons are out of date.",
      ],
    };
  },
});

/** Cloudflare: `wrangler.jsonc` with bindings derived from the graph and a deploy workflow. */
export const cloudflareDeployTarget: DeployTarget = Object.freeze({
  id: "cloudflare",
  label: "Cloudflare",
  runtimes: Object.freeze(["workers"] as const),
  defaultRuntime: "workers",
  needsGraph: true,
  plan: async ({ root, graph }: DeployTargetInput) => {
    const exit = await Effect.runPromiseExit(
      cloudflareTarget(root, requiredGraph(graph, "cloudflare")),
    );
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
    return { files: exit.value.files, nextSteps: exit.value.nextSteps };
  },
});

/** Every platform target `relkit deploy init` accepts, in documentation order. */
export const DEPLOY_TARGETS: readonly DeployTarget[] = Object.freeze([
  railwayDeployTarget,
  vercelDeployTarget,
  cloudflareDeployTarget,
]);

/**
 * Requires the compiled graph for a target that reads it.
 * @param graph - Graph text or undefined.
 * @param target - Target id, for the message.
 * @returns The graph text.
 * @throws DeployCommandError naming `relkit check` when the graph is missing.
 */
function requiredGraph(graph: string | undefined, target: string): string {
  if (graph === undefined)
    throw new DeployCommandError(
      "RELKIT_DEPLOY_USAGE",
      `relkit deploy init ${target} reads the application graph from ${GRAPH_FILE}; run relkit check first.`,
    );
  return graph;
}
