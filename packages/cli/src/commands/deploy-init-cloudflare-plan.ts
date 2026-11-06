/**
 * Derives what a Cloudflare Worker needs from the compiled graph for `relkit deploy init
 * cloudflare`: its name, the KV, R2 and Durable Object bindings of binding providers, and whether
 * jobs or events use the Postgres backend, which needs the work queue and a Cron Trigger.
 */
import { usedProviderProfiles, type WorkersGraphNode } from "./check-workers-usage.js";

/** Wrangler release the generated workflow and RelKit's Workers tests run. */
export const CLOUDFLARE_WRANGLER_VERSION = "4.151.3";
/** Workers compatibility date the generated configuration pins. */
export const WORKERS_COMPATIBILITY_DATE = "2026-10-01";
/** What the Worker needs, derived from the compiled graph. */
export interface CloudflarePlan {
  /** Worker name: the package name in lower case, hyphens only. */
  readonly name: string;
  readonly kv: readonly string[];
  readonly r2: readonly string[];
  readonly realtime: readonly string[];
  /** Jobs or events use the Postgres backend, so the Worker needs the work queue and a Cron Trigger. */
  readonly durableWork: boolean;
}

/**
 * Reads the bindings and durable work from the graph.
 * @param graphText - Compiled application graph JSON.
 * @param packageName - `name` from package.json, if any.
 * @returns The plan.
 * @throws SyntaxError when the graph is not JSON.
 */
export function cloudflarePlan(graphText: string, packageName: string | undefined): CloudflarePlan {
  const nodes =
    (JSON.parse(graphText) as { readonly nodes?: readonly WorkersGraphNode[] }).nodes ?? [];
  const bindings = (adapterId: string): readonly string[] =>
    [
      ...new Set(
        nodes.flatMap((node) => {
          const binding = node.adapter?.behavior?.binding;
          return node.kind === "provider" &&
            node.adapter?.adapterId === adapterId &&
            typeof binding === "string"
            ? [binding]
            : [];
        }),
      ),
    ].sort();
  return {
    name: workerName(packageName),
    kv: bindings("cloudflare-kv-binding"),
    r2: bindings("cloudflare-r2-binding"),
    realtime: bindings("cloudflare-durable-object-realtime"),
    durableWork: usedProviderProfiles(nodes).some(
      (profile) =>
        (profile.capability === "job" || profile.capability === "event") &&
        profile.provider?.adapter?.integrationId === "postgres",
    ),
  };
}

/**
 * Names the queue that wakes the Worker for durable work.
 * @param plan - The plan.
 * @returns The queue name.
 */
export function workQueueName(plan: Pick<CloudflarePlan, "name">): string {
  return `${plan.name}-relkit-work`;
}

/**
 * Derives a Worker name from the package name.
 * @param packageName - `name` from package.json.
 * @returns Lower-case letters, digits and hyphens, at most 54 characters so suffixes fit 63.
 */
function workerName(packageName: string | undefined): string {
  const name = (packageName ?? "")
    .replace(/^@[^/]+\//u, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 54)
    .replace(/-+$/u, "");
  return name === "" ? "relkit-app" : name;
}
