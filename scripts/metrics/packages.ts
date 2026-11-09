/** Counts the published workspace packages by role and judges the plan's "6 first-party plus integrations" target. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { missing } from "./metric-support.js";
import type { MetricResult } from "./types.js";

/** Published workspace packages, by role. */
export interface PackageCounts {
  /** The six first-party packages (`FIRST_PARTY`) that exist. */
  readonly firstParty: number;
  /** Everything else published from `integrations/packages/` and the optional tools under `packages/`. */
  readonly integrations: number;
  /** Packages under `packages/` that are neither first-party nor a listed optional tool. */
  readonly unclassified: readonly string[];
}

/** The plan's six first-party packages: the core, the CLI, the client, the Inspector, testing and the creator. */
export const FIRST_PARTY = [
  "relkit",
  "@relkit/cli",
  "@relkit/client",
  "@relkit/inspector",
  "@relkit/testing",
  "create-relkit",
] as const;

/** Packages under `packages/` that stay published but are not first-party: the deprecated re-export and optional tools. */
export const OPTIONAL_TOOLS = ["@relkit/app", "@relkit/better-auth", "@relkit/drizzle"] as const;

/**
 * Lists the published (non-private) workspace package names.
 * @param root - Repository root.
 * @param parent - `packages` or `integrations/packages`.
 * @returns Package names in directory order.
 */
function publishedNames(root: string, parent: string): string[] {
  if (!existsSync(join(root, parent))) return [];
  return readdirSync(join(root, parent)).flatMap((name) => {
    const manifest = join(root, parent, name, "package.json");
    if (!existsSync(manifest)) return [];
    const { private: hidden, name: packageName } = JSON.parse(readFileSync(manifest, "utf8")) as {
      private?: boolean;
      name: string;
    };
    return hidden === true ? [] : [packageName];
  });
}

/**
 * Counts the published workspace packages by role.
 * @param root - Repository root.
 * @returns First-party, integration and unclassified packages.
 */
export function countPackages(root: string): PackageCounts {
  const framework = publishedNames(root, "packages");
  const known = new Set<string>([...FIRST_PARTY, ...OPTIONAL_TOOLS]);
  return {
    firstParty: FIRST_PARTY.filter((name) => framework.includes(name)).length,
    integrations:
      publishedNames(root, "integrations/packages").length +
      framework.filter((name) => (OPTIONAL_TOOLS as readonly string[]).includes(name)).length,
    unclassified: framework.filter((name) => !known.has(name)),
  };
}

export function packagesMetric(packages: PackageCounts | undefined): MetricResult {
  const name = "Publishable packages";
  const target = `${FIRST_PARTY.length} first-party plus integrations`;
  if (packages === undefined)
    return missing("published-packages", name, target, "The workspace was not read.");
  const extra = packages.unclassified;
  return {
    id: "published-packages",
    name,
    target,
    status: packages.firstParty === FIRST_PARTY.length && extra.length === 0 ? "met" : "not-met",
    value: `${packages.firstParty} first-party plus ${packages.integrations} integrations and tools`,
    numeric: packages.firstParty + packages.integrations + extra.length,
    detail:
      extra.length > 0
        ? `Not yet first-party or a listed tool: ${extra.join(", ")}.`
        : "Non-private manifests under packages/ and integrations/packages/.",
  };
}
