import type { InspectorObject } from "./api-types";

export interface Provenance {
  readonly label: string;
  /** One sentence for a tooltip or a detail page. */
  readonly text: string;
  /** Whether a release build has a source for this binding. */
  readonly hasReleaseSource: boolean;
}

/**
 * Where a provider binding comes from. This is provenance, not health: a local-only binding works
 * in development and simply has no release source.
 * @param kind - The binding's `providerSource.kind`.
 */
export function provenance(kind: string | undefined): Provenance {
  switch (kind) {
    case "local-only":
      return {
        label: "local only",
        text: "Local only: no release source.",
        hasReleaseSource: false,
      };
    case "connected":
      return {
        label: "connected",
        text: "Connected: it has a release source.",
        hasReleaseSource: true,
      };
    case "infrastructure":
      return {
        label: "infrastructure",
        text: "Infrastructure: a release build provisions it.",
        hasReleaseSource: true,
      };
    case undefined:
    case "":
      return { label: "not reported", text: "No source is reported.", hasReleaseSource: true };
    default:
      return { label: kind, text: `Source: ${kind}.`, hasReleaseSource: true };
  }
}

/** The header count of the Providers page, worded as provenance. */
export function releaseSourceSummary(kinds: readonly (string | undefined)[]): string {
  const withSource = kinds.filter((kind) => provenance(kind).hasReleaseSource).length;
  return `${withSource} of ${kinds.length} have a release source`;
}

const SEVERITY: readonly string[] = ["ready", "degraded", "unavailable"];

/**
 * The health a provider binding reports: the state the runtime reports for the resources that use
 * the binding's profile. The worst state wins.
 * @param capability - The binding's capability, such as `bucket` or `cache`.
 * @param profile - The binding's profile.
 * @param runtime - The runtime items of each resource kind, with their reported `state`.
 * @returns The state, or undefined when no resource reports one for this binding.
 */
export function providerHealth(
  capability: string,
  profile: string,
  runtime: Readonly<{ bucket: readonly InspectorObject[]; cache: readonly InspectorObject[] }>,
): string | undefined {
  if (capability !== "bucket" && capability !== "cache") return undefined;
  const states = runtime[capability].flatMap((item) =>
    item.profile === profile && typeof item.state === "string" && item.state !== ""
      ? [item.state]
      : [],
  );
  if (states.length === 0) return undefined;
  const rank = (state: string): number => {
    const index = SEVERITY.indexOf(state);
    return index === -1 ? SEVERITY.length : index;
  };
  return [...states].sort((left, right) => rank(right) - rank(left))[0];
}
