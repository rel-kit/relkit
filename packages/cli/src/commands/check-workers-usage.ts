/**
 * Finds the provider profiles an application graph uses, for the Workers provider rule: a profile is
 * used when a cache, bucket, job, event, event trigger, queue trigger, channel or agent names it.
 */

/** Capabilities whose providers the Workers rule checks. */
export type WorkersProviderCapability =
  "job" | "event" | "realtime" | "cache" | "bucket" | "agent-state";

/** The graph fields the Workers rules read. */
export interface WorkersGraphNode {
  readonly kind?: string;
  readonly id?: string;
  readonly capability?: string | { readonly kind?: string; readonly dialect?: string };
  readonly profile?: string;
  readonly stateProfile?: string;
  readonly triggerType?: string;
  readonly config?: { readonly profile?: string; readonly kind?: string };
  readonly adapter?: { readonly integrationId?: string };
  readonly source?: { readonly file?: string; readonly line?: number; readonly column?: number };
}

/** One used profile, with its provider node when the graph declares one. */
export interface UsedProviderProfile {
  readonly capability: WorkersProviderCapability;
  readonly profile: string;
  readonly provider: WorkersGraphNode | undefined;
  readonly firstUse: WorkersGraphNode | undefined;
  /** Plain description of what uses the profile, such as `2 caches`. */
  readonly usage: string;
}

const NOUNS: Readonly<Record<WorkersProviderCapability, readonly [string, string]>> = {
  job: ["job", "jobs"],
  event: ["event use", "event uses"],
  realtime: ["channel", "channels"],
  cache: ["cache", "caches"],
  bucket: ["bucket", "buckets"],
  "agent-state": ["agent", "agents"],
};

/**
 * Names the capability and profile a node uses, if any.
 * @param node - Graph node.
 * @returns The used capability and profile, or undefined.
 */
function use(
  node: WorkersGraphNode,
): { readonly capability: WorkersProviderCapability; readonly profile: string } | undefined {
  const profile = node.profile ?? "default";
  switch (node.kind) {
    case "cache":
    case "bucket":
      return { capability: node.kind, profile };
    case "job":
      return { capability: "job", profile };
    case "event":
      return { capability: "event", profile };
    case "channel":
      return { capability: "realtime", profile };
    case "agent":
      return node.stateProfile === undefined
        ? undefined
        : { capability: "agent-state", profile: node.stateProfile };
    case "trigger":
      if (node.triggerType === "event")
        return { capability: "event", profile: node.config?.profile ?? "default" };
      if (node.triggerType === "queue" || node.config?.kind === "queue")
        return { capability: "job", profile: node.config?.profile ?? "default" };
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Lists the used provider profiles, in capability and profile order.
 * @param nodes - Graph nodes.
 * @returns One entry per used capability and profile.
 */
export function usedProviderProfiles(
  nodes: readonly WorkersGraphNode[],
): readonly UsedProviderProfile[] {
  const uses = new Map<
    string,
    { capability: WorkersProviderCapability; profile: string; nodes: WorkersGraphNode[] }
  >();
  for (const node of nodes) {
    const found = use(node);
    if (found === undefined) continue;
    const key = `${found.capability}:${found.profile}`;
    const entry = uses.get(key) ?? { ...found, nodes: [] };
    entry.nodes.push(node);
    uses.set(key, entry);
  }
  return [...uses.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => {
      const [one, many] = NOUNS[entry.capability];
      return {
        capability: entry.capability,
        profile: entry.profile,
        provider: nodes.find(
          (node) =>
            node.kind === "provider" &&
            node.capability === entry.capability &&
            (node.profile ?? "default") === entry.profile,
        ),
        firstUse: entry.nodes[0],
        usage: `${entry.nodes.length} ${entry.nodes.length === 1 ? one : many}`,
      };
    });
}
