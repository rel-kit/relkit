/**
 * The Vercel realtime rule of `relkit check`. A project with `vercel.json` deploys as functions:
 * instances start and stop with traffic and keep nothing between invocations, so a realtime channel
 * that clients subscribe to cannot rely on the local provider's per-machine state. The rule reports
 * each client-facing channel whose realtime profile is not backed by an external provider (any
 * provider other than the local filesystem one).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDiagnostic, type Diagnostic } from "relkit/diagnostics";
import { Effect } from "effect";

/** Code of the rule; documented in the diagnostics catalog. */
export const VERCEL_REALTIME_PROVIDER_CODE = "RELKIT_VERCEL_REALTIME_PROVIDER_REQUIRED";

/** The graph fields this rule reads. */
interface GraphNode {
  readonly kind?: string;
  readonly id?: string;
  readonly capability?: string;
  readonly profile?: string;
  readonly client?: string;
  readonly adapter?: { readonly integrationId?: string };
  readonly source?: { readonly file?: string; readonly line?: number; readonly column?: number };
}

/**
 * Reports client-facing channels without an external realtime provider in a Vercel project.
 * @param projectRoot - Project root; the rule applies only when it holds `vercel.json`.
 * @param graphText - Compiled application graph JSON.
 * @returns One error per offending channel; none outside a Vercel project.
 */
export const vercelRealtimeDiagnosticsEffect = Effect.fn("Project.checkVercelRealtime")(function* (
  projectRoot: string,
  graphText: string,
) {
  const vercel = yield* Effect.promise(() =>
    readFile(join(projectRoot, "vercel.json"), "utf8").then(
      () => true,
      () => false,
    ),
  );
  return vercel ? vercelRealtimeDiagnostics(graphText, projectRoot) : [];
});

/**
 * Applies the rule to a graph.
 * @param graphText - Compiled application graph JSON.
 * @param projectRoot - Project root for portable source paths.
 * @returns One error per client-facing channel whose profile has no external provider.
 */
export function vercelRealtimeDiagnostics(graphText: string, projectRoot: string): Diagnostic[] {
  let nodes: readonly GraphNode[];
  try {
    nodes = (JSON.parse(graphText) as { readonly nodes?: readonly GraphNode[] }).nodes ?? [];
  } catch {
    return [];
  }
  const providers = new Map(
    nodes
      .filter((node) => node.kind === "provider" && node.capability === "realtime")
      .map((node) => [node.profile ?? "default", node.adapter?.integrationId]),
  );
  return nodes
    .filter((node) => node.kind === "channel" && node.client !== "internal")
    .filter((channel) => {
      const integration = providers.get(channel.profile ?? "default");
      return integration === undefined || integration === "local";
    })
    .map((channel) => {
      const profile = channel.profile ?? "default";
      const integration = providers.get(profile);
      const source = channel.source;
      const located =
        source?.file !== undefined && source.line !== undefined && source.column !== undefined;
      return createDiagnostic(
        {
          code: VERCEL_REALTIME_PROVIDER_CODE,
          severity: "error",
          message: `Channel ${channel.id ?? "channel"} uses realtime profile ${profile}, which ${integration === undefined ? "has no provider" : "uses the local provider"}; Vercel functions keep no state between invocations and run as many instances as traffic needs, so subscribers would miss events published from another instance.`,
          suggestion:
            "Select an external realtime provider for the profile, such as `redisRealtime()` from `@relkit/redis` with a Redis the deployment can reach, or deploy the app to a container target such as Railway.",
          ...(located ? { file: source.file!, line: source.line!, column: source.column! } : {}),
        },
        { projectRoot },
      );
    });
}
