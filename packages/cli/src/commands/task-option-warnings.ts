/**
 * Task limits a jobs backend does not enforce. A task may declare `maxDuration` and `maxElapsed`;
 * a backend that enforces one lists the matching feature on its adapter. `relkit check` warns for
 * every other pair of task and limit, and the generated server logs the same list when it starts,
 * so a limit is never ignored without a report. Both read the compiled application graph.
 */
import { createDiagnostic, type Diagnostic } from "relkit/diagnostics";

/** Code of the warning; documented in the diagnostics catalog. */
export const TASK_OPTION_UNSUPPORTED_CODE = "RELKIT_JOB_TASK_OPTION_UNSUPPORTED";

/** The limits a backend must declare, with the adapter feature that declares each. */
const LIMIT_FEATURES = {
  maxDuration: "task-max-duration",
  maxElapsed: "task-max-elapsed",
} as const;

/** One limit of one task that its jobs backend does not enforce. */
export interface UnsupportedTaskOption {
  readonly taskId: string;
  readonly option: keyof typeof LIMIT_FEATURES;
  readonly backend: string;
  readonly profile: string;
  readonly message: string;
}

/** The graph fields this check reads. */
interface GraphNode {
  readonly kind?: string;
  readonly capability?: string;
  readonly profile?: string;
  readonly taskId?: string;
  readonly policy?: Readonly<Record<string, unknown>> | null;
  readonly adapter?: {
    readonly integrationId?: string;
    readonly features?: readonly unknown[];
  };
  readonly source?: { readonly file?: string; readonly line?: number; readonly column?: number };
}

/**
 * Finds every declared task limit that the backend running the task does not enforce.
 * @param graphText - Compiled application graph JSON.
 * @returns One entry per task, limit and jobs profile, in graph order; none for a graph that did
 *   not compile.
 */
export function unsupportedTaskOptions(graphText: string): readonly UnsupportedTaskOption[] {
  return findings(parseGraphNodes(graphText)).map(({ entry }) => entry);
}

/**
 * Reports the unenforced limits as check warnings at the task that declares them.
 * @param graphText - Compiled application graph JSON.
 * @returns One warning per entry of {@link unsupportedTaskOptions}.
 */
export function taskOptionDiagnostics(graphText: string): readonly Diagnostic[] {
  return findings(parseGraphNodes(graphText)).map(({ entry, task }) =>
    createDiagnostic({
      code: TASK_OPTION_UNSUPPORTED_CODE,
      severity: "warning",
      message: entry.message,
      suggestion: `Enforce the limit in the task's handler, or remove ${entry.option}. The local backend from \`@relkit/local\` enforces it.`,
      ...(task.source?.file === undefined ? {} : { file: task.source.file }),
      ...(task.source?.line === undefined ? {} : { line: task.source.line }),
      ...(task.source?.column === undefined ? {} : { column: task.source.column }),
    }),
  );
}

/**
 * Pairs each job's task with the provider of the job's profile and compares limits with features.
 * @param nodes - Graph nodes.
 * @returns Each finding with the task node that declares the limit.
 */
function findings(
  nodes: readonly GraphNode[],
): readonly { readonly entry: UnsupportedTaskOption; readonly task: GraphNode }[] {
  const seen = new Set<string>();
  return nodes.flatMap((job) => {
    if (job.kind !== "job" || job.taskId === undefined) return [];
    const profile = job.profile ?? "default";
    const task = nodes.find((node) => node.kind === "task" && node.taskId === job.taskId);
    const provider = nodes.find(
      (node) =>
        node.kind === "provider" &&
        node.capability === "job" &&
        (node.profile ?? "default") === profile,
    );
    if (task === undefined || provider === undefined) return [];
    const features = new Set(
      (provider.adapter?.features ?? []).filter((feature) => typeof feature === "string"),
    );
    const backend = provider.adapter?.integrationId ?? "unknown";
    return (Object.keys(LIMIT_FEATURES) as (keyof typeof LIMIT_FEATURES)[]).flatMap((option) => {
      const key = `${job.taskId}\u0000${option}\u0000${profile}`;
      if (task.policy?.[option] == null || features.has(LIMIT_FEATURES[option]) || seen.has(key))
        return [];
      seen.add(key);
      const message = `Task "${job.taskId}" declares ${option}, which the ${backend} jobs backend (profile "${profile}") does not enforce.`;
      return [{ entry: { taskId: job.taskId!, option, backend, profile, message }, task }];
    });
  });
}

/**
 * Reads the graph's nodes, treating text that is not a graph document as an empty graph.
 * @param graphText - Compiled application graph JSON.
 * @returns The graph's nodes, or none.
 */
function parseGraphNodes(graphText: string): readonly GraphNode[] {
  try {
    return (JSON.parse(graphText) as { readonly nodes?: readonly GraphNode[] }).nodes ?? [];
  } catch {
    return [];
  }
}
