import { DetailList } from "../components/blocks/details";
import { StatusBadge } from "../components/neon/status-badge";
import type { ActivationFingerprint } from "../lib/graph-topology-model";
import { HeadedSection } from "./overview/headed-section";

/** Artifact identity hashes the active generation was activated with, as copyable mono values. */
export function ActivationCohort({
  graphHash,
  fingerprint,
}: {
  readonly graphHash: string;
  readonly fingerprint?: ActivationFingerprint;
}) {
  const mismatch = fingerprint !== undefined && fingerprint.graphHash !== graphHash;
  const members: readonly (readonly [string, string])[] =
    fingerprint === undefined
      ? []
      : [
          ["Graph", fingerprint.graphHash],
          ["Manifest", fingerprint.manifestHash],
          ["Runtime integrations", fingerprint.runtimeIntegrationsPlanHash],
          ...(fingerprint.localServicesPlanHash
            ? [["Local services", fingerprint.localServicesPlanHash] as const]
            : []),
          ...(fingerprint.providerOverridesGeneration
            ? [["Provider overrides", fingerprint.providerOverridesGeneration] as const]
            : []),
        ];
  return (
    <HeadedSection
      aria-labelledby="activation-cohort-heading"
      kicker="ACTIVATION COHORT"
      title="Verified artifact identity"
      actions={
        <StatusBadge
          tone={mismatch ? "danger" : fingerprint ? "success" : "neutral"}
          label={mismatch ? "mismatch" : fingerprint ? "verified" : "unavailable"}
        />
      }
    >
      {mismatch && (
        <p
          role="alert"
          className="m-0 mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          The active graph differs from its fingerprint. Rebuild before activation.
        </p>
      )}
      {fingerprint === undefined ? (
        <p role="status" className="m-0 text-xs text-muted-foreground">
          Composite activation fingerprint is unavailable.
        </p>
      ) : (
        <DetailList
          items={members.map(([label, value]) => ({
            label,
            value: (
              <span className="block truncate" title={value}>
                {value}
              </span>
            ),
            mono: true,
            copy: value,
          }))}
        />
      )}
    </HeadedSection>
  );
}
