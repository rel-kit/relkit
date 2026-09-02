import type { ActivationFingerprint } from "../lib/graph-topology-model";

export function ActivationCohort({
  graphHash,
  fingerprint,
}: {
  readonly graphHash: string;
  readonly fingerprint?: ActivationFingerprint;
}) {
  const mismatch = fingerprint !== undefined && fingerprint.graphHash !== graphHash;
  const members =
    fingerprint === undefined
      ? []
      : [
          ["Graph", fingerprint.graphHash],
          ["Manifest", fingerprint.manifestHash],
          ["Runtime integrations", fingerprint.runtimeIntegrationsPlanHash],
          ...(fingerprint.localServicesPlanHash
            ? [["Local services", fingerprint.localServicesPlanHash]]
            : []),
          ...(fingerprint.providerOverridesGeneration
            ? [["Provider overrides", fingerprint.providerOverridesGeneration]]
            : []),
        ];
  return (
    <section className="panel" aria-labelledby="activation-cohort-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ACTIVATION COHORT</p>
          <h2 id="activation-cohort-heading">Verified artifact identity</h2>
        </div>
        <span className="badge">
          {mismatch ? "Mismatch" : fingerprint ? "Verified" : "Unavailable"}
        </span>
      </div>
      {mismatch && (
        <p role="alert" className="supporting-copy">
          The active graph differs from its fingerprint. Rebuild before activation.
        </p>
      )}
      {fingerprint === undefined ? (
        <p role="status" className="supporting-copy">
          Composite activation fingerprint is unavailable.
        </p>
      ) : (
        <dl className="route-meta">
          {members.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{bounded(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function bounded(value: string): string {
  return value.length <= 72 ? value : `${value.slice(0, 42)}…${value.slice(-18)}`;
}
