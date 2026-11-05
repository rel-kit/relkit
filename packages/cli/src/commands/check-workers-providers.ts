/**
 * The Workers provider rule of `relkit check`. A project with a wrangler configuration
 * (`wrangler.jsonc`, `wrangler.json` or `wrangler.toml`) deploys as a Cloudflare Worker: no local
 * filesystem, no process that outlives a request, and as many isolates as traffic needs. The rule
 * reports every used provider profile whose provider needs one of those (the local provider, a
 * polling job worker, a missing provider that would fall back to local state) and every SQLite
 * database, naming a provider that runs on Workers.
 */
import { access } from "node:fs/promises";
import { join } from "node:path";
import { createDiagnostic, type Diagnostic } from "relkit/diagnostics";
import { Effect } from "effect";
import {
  usedProviderProfiles,
  type WorkersGraphNode,
  type WorkersProviderCapability,
} from "./check-workers-usage.js";

/** Code of the provider rule; documented in the diagnostics catalog. */
export const WORKERS_PROVIDER_CODE = "RELKIT_WORKERS_PROVIDER_UNSUPPORTED";
/** Code of the SQLite rule; documented in the diagnostics catalog. */
export const WORKERS_SQLITE_CODE = "RELKIT_WORKERS_SQLITE_UNSUPPORTED";

/** Configuration files that mark a project as a Cloudflare Workers deployment. */
export const WRANGLER_CONFIG_FILES = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"] as const;

/** Integrations whose provider runs on Workers, per capability, and the alternative to name. */
const WORKERS_PROVIDERS: Readonly<
  Record<WorkersProviderCapability, { readonly allowed: readonly string[]; readonly use: string }>
> = {
  job: {
    allowed: ["cloudflare"],
    use: "Cloudflare Queues: `queueJobs()` from `@relkit/cloudflare`",
  },
  event: {
    allowed: ["cloudflare"],
    use: "Cloudflare Queues: `queueEvents()` from `@relkit/cloudflare`",
  },
  realtime: {
    allowed: ["cloudflare"],
    use: "Durable Objects: `durableObjectRealtime()` from `@relkit/cloudflare`",
  },
  cache: {
    allowed: ["cloudflare", "redis"],
    use: "a Workers KV binding (`kvBinding()` from `@relkit/cloudflare`), Workers KV over its API (`kv()`), or Redis over HTTP (`redis()` from `@relkit/redis` with an `https://` URL)",
  },
  bucket: {
    allowed: ["cloudflare", "s3"],
    use: "an R2 binding (`r2Binding()` from `@relkit/cloudflare`), R2 over its S3 API (`r2()`), or an S3-compatible bucket (`s3()` from `@relkit/s3`)",
  },
  "agent-state": {
    // Waiting for agent state changes needs a blocking Redis read, which HTTP cannot do.
    allowed: [],
    use: "No agent state provider runs on Workers yet: agent state waits on a blocking Redis read, which HTTP cannot do. Deploy apps with agents to a container target such as Railway.",
  },
};

/** Why an integration does not run on Workers. */
const REASONS: Readonly<Record<string, string>> = {
  local: "keeps its state in local files, and a Worker has no filesystem",
  "effect-mq": "runs a worker that polls Postgres in a long-lived process",
  postgres: "runs jobs and events from a worker loop in a long-lived process",
  inngest: "serves its function endpoint from a listener the Worker does not run",
  trigger: "runs tasks through a worker process the Worker does not run",
  docker: "starts containers from a local process",
};

/**
 * Reports providers and databases that cannot run on Workers in a Workers project.
 * @param projectRoot - Project root; the rule applies only when it holds a wrangler configuration.
 * @param graphText - Compiled application graph JSON.
 * @returns One error per offending profile or database; none outside a Workers project.
 */
export const workersProviderDiagnosticsEffect = Effect.fn("Project.checkWorkersProviders")(
  function* (projectRoot: string, graphText: string) {
    const found = yield* Effect.promise(() =>
      Promise.all(
        WRANGLER_CONFIG_FILES.map((file) =>
          access(join(projectRoot, file)).then(
            () => true,
            () => false,
          ),
        ),
      ),
    );
    return found.includes(true) ? workersProviderDiagnostics(graphText, projectRoot) : [];
  },
);

/**
 * Applies the rule to a graph.
 * @param graphText - Compiled application graph JSON.
 * @param projectRoot - Project root for portable source paths.
 * @returns One error per used profile without a Workers provider and per SQLite database.
 */
export function workersProviderDiagnostics(graphText: string, projectRoot: string): Diagnostic[] {
  let nodes: readonly WorkersGraphNode[];
  try {
    nodes = (JSON.parse(graphText) as { readonly nodes?: readonly WorkersGraphNode[] }).nodes ?? [];
  } catch {
    return [];
  }
  const providers = usedProviderProfiles(nodes).flatMap((profile) => {
    const rule = WORKERS_PROVIDERS[profile.capability];
    const integration = profile.provider?.adapter?.integrationId;
    if (integration !== undefined && rule.allowed.includes(integration)) return [];
    const described =
      integration === undefined
        ? "has no provider, so it would fall back to local state"
        : `uses the ${integration} provider, which ${REASONS[integration] ?? "does not run on Cloudflare Workers"}`;
    return [
      diagnostic(
        WORKERS_PROVIDER_CODE,
        `The ${profile.capability} profile ${profile.profile} (${profile.usage}) ${described}; Cloudflare Workers has no local filesystem and no long-lived process.`,
        rule.allowed.length === 0
          ? rule.use
          : `Select a provider that runs on Workers for the profile: ${rule.use}. Or deploy to a container target such as Railway.`,
        profile.provider?.source ?? profile.firstUse?.source,
        projectRoot,
      ),
    ];
  });
  const databases = nodes
    .filter(
      (node) =>
        node.kind === "service" &&
        typeof node.capability === "object" &&
        node.capability.dialect === "sqlite",
    )
    .map((service) =>
      diagnostic(
        WORKERS_SQLITE_CODE,
        `Service ${service.id ?? "service"} uses a SQLite database, which lives in a local file; Cloudflare Workers has no local filesystem.`,
        "Use a Postgres database the Worker can reach (the `pg` Drizzle dialect, for example through Cloudflare Hyperdrive), or deploy to a container target such as Railway.",
        service.source,
        projectRoot,
      ),
    );
  return [...providers, ...databases];
}

/**
 * Builds one located error.
 * @param code - Diagnostic code.
 * @param message - What was found.
 * @param suggestion - Supported alternative.
 * @param source - Source location, when the graph has one.
 * @param projectRoot - Project root for portable source paths.
 * @returns The diagnostic.
 */
function diagnostic(
  code: string,
  message: string,
  suggestion: string,
  source: WorkersGraphNode["source"],
  projectRoot: string,
): Diagnostic {
  const located =
    source?.file !== undefined && source.line !== undefined && source.column !== undefined;
  return createDiagnostic(
    {
      code,
      severity: "error",
      message,
      suggestion,
      ...(located ? { file: source.file!, line: source.line!, column: source.column! } : {}),
    },
    { projectRoot },
  );
}
