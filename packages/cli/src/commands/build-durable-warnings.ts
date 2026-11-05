/**
 * Production-build warnings for durable work on the local filesystem provider.
 * `@relkit/local` keeps jobs, schedules and event deliveries under
 * `.relkit/state` on one machine, so a production instance loses them on
 * redeploy and never shares them with a second instance. The build reads the
 * compiled application graph and warns once per local jobs or events profile
 * that the application actually uses; the build itself still succeeds.
 */
import { createDiagnostic, type Diagnostic } from "relkit/diagnostics";

/** Code of the warning; documented in the diagnostics catalog. */
export const LOCAL_DURABLE_PROVIDER_CODE = "RELKIT_BUILD_LOCAL_DURABLE_PROVIDER";

/** The graph fields this check reads. */
interface GraphNode {
  readonly kind?: string;
  readonly id?: string;
  readonly capability?: string;
  readonly profile?: string;
  readonly triggerType?: string;
  readonly config?: { readonly profile?: string };
  readonly schedules?: readonly object[] | null;
  readonly adapter?: { readonly integrationId?: string };
  readonly source?: { readonly file?: string; readonly line?: number; readonly column?: number };
}

/**
 * Finds jobs and events profiles that use the local provider in a production build.
 * @param graphText - Compiled application graph JSON.
 * @returns One warning per used local jobs or events profile.
 */
export function localDurableProviderWarnings(graphText: string): readonly Diagnostic[] {
  const nodes = (JSON.parse(graphText) as { readonly nodes?: readonly GraphNode[] }).nodes ?? [];
  const warnings: Diagnostic[] = [];
  for (const provider of nodes) {
    if (provider.kind !== "provider" || provider.adapter?.integrationId !== "local") continue;
    if (provider.capability !== "job" && provider.capability !== "event") continue;
    const usage = describeUsage(nodes, provider.capability, provider.profile ?? "default");
    if (usage === undefined) continue;
    warnings.push(
      createDiagnostic({
        code: LOCAL_DURABLE_PROVIDER_CODE,
        severity: "warning",
        message: `${usage} use the local filesystem provider (profile ${provider.profile ?? "default"}); in production their state stays on one machine and is lost on redeploy.`,
        suggestion:
          "Select a durable provider such as `relkit add jobs --provider postgres` or `relkit add events --provider postgres`.",
        ...(provider.source?.file === undefined ? {} : { file: provider.source.file }),
        ...(provider.source?.line === undefined ? {} : { line: provider.source.line }),
        ...(provider.source?.column === undefined ? {} : { column: provider.source.column }),
      }),
    );
  }
  return warnings;
}

/**
 * Names what uses a profile: jobs and schedules, or events.
 * @param nodes - Graph nodes.
 * @param capability - `job` or `event`.
 * @param profile - Provider profile.
 * @returns A phrase such as `2 jobs and 1 schedule`, or undefined when nothing uses it.
 */
function describeUsage(
  nodes: readonly GraphNode[],
  capability: "job" | "event",
  profile: string,
): string | undefined {
  if (capability === "job") {
    const jobs = nodes.filter(
      (node) => node.kind === "job" && (node.profile ?? "default") === profile,
    );
    const schedules = jobs.reduce((total, job) => total + (job.schedules?.length ?? 0), 0);
    if (jobs.length === 0) return undefined;
    const counted = `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`;
    if (schedules === 0) return counted;
    return `${counted} and ${schedules} ${schedules === 1 ? "schedule" : "schedules"}`;
  }
  const events = nodes.filter(
    (node) =>
      (node.kind === "event" && (node.profile ?? "default") === profile) ||
      (node.kind === "trigger" &&
        node.triggerType === "event" &&
        (node.config?.profile ?? "default") === profile),
  );
  return events.length === 0 ? undefined : "Events";
}
