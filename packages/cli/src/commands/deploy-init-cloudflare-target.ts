/**
 * The `cloudflare` branch of `relkit deploy init`: reads the compiled graph and the package name,
 * and returns the files and the next steps. KV namespaces and R2 buckets are provisioned by the
 * first `wrangler deploy`; the work queue and the database secret are created by hand once.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { cliPromise } from "../cli-errors.js";
import { cloudflareFiles, cloudflarePlan, workQueueName } from "./deploy-init-cloudflare.js";
import { DeployCommandError } from "./deploy-support.js";

/**
 * Renders the Cloudflare target.
 * @param root - Project root.
 * @param graph - Compiled application graph JSON.
 * @returns Files, next steps and the target's display name.
 * @throws DeployCommandError when the graph is not valid JSON.
 */
export const cloudflareTarget = Effect.fn("Cli.deployInitCloudflare")(function* (
  root: string,
  graph: string,
) {
  const name = yield* cliPromise("deploy.init.package", () =>
    readFile(join(root, "package.json"), "utf8").then(
      (text) => (JSON.parse(text) as { readonly name?: unknown }).name,
      () => undefined,
    ),
  );
  const plan = yield* Effect.try({
    try: () => cloudflarePlan(graph, typeof name === "string" ? name : undefined),
    catch: () =>
      new DeployCommandError(
        "RELKIT_DEPLOY_USAGE",
        ".relkit/generated/application.graph.json is not valid JSON; run relkit check again.",
      ),
  });
  const wrangler = "bunx wrangler";
  return {
    label: "Cloudflare",
    files: cloudflareFiles(plan),
    nextSteps: [
      `Sign in with ${wrangler} login (or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID).`,
      ...(plan.durableWork
        ? [
            `Create the work queue once: ${wrangler} queues create ${workQueueName(plan)}.`,
            `Give the Worker its database: ${wrangler} secret put DATABASE_URL (a Postgres it can reach; Cloudflare Hyperdrive in front keeps connections cheap).`,
          ]
        : []),
      `Deploy with ${wrangler} deploy; it runs relkit build --runtime workers and creates the KV namespaces and R2 buckets on the first deploy.`,
      "For CI, add the CLOUDFLARE_API_TOKEN secret and the CLOUDFLARE_ACCOUNT_ID variable in GitHub; the workflow deploys every push to main.",
      "Rerun relkit deploy init cloudflare after adding caches, buckets, realtime or durable work, so wrangler.jsonc declares their bindings.",
    ],
  };
});
