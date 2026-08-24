import type { OperationStatus, ResourceOperationView, ResourceView } from "../lib/resources-model";
import type { ReactNode } from "react";
import { SourceLink } from "./source-link";
import { SchemaPanel } from "./schema-panel";

export function ResourceDetailView({ view }: { readonly view: ResourceView }) {
  const label = view.kind === "bucket" ? "Bucket" : "Cache";
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>{label} detail</h1>
          <p className="lede">
            Provider storage remains behind the versioned API; this page is read-only metadata.
          </p>
        </div>
        <span className="badge">{view.id}</span>
      </header>
      <IdentityPanel view={view} />
      <OperationPanel operations={view.operations} />
      <MetadataPanel view={view} />
      {Object.keys(view.stats).length > 0 && <StatsPanel stats={view.stats} />}
    </div>
  );
}

function IdentityPanel({ view }: { readonly view: ResourceView }) {
  const source = view.descriptor.source;
  return (
    <section className="panel route-identity" aria-labelledby="resource-identity-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">RESOURCE IDENTITY</p>
          <h2 id="resource-identity-heading">{view.id}</h2>
        </div>
        <span className="badge">{view.profile}</span>
      </div>
      <dl className="route-meta">
        <Meta label="Profile" value={view.profile} />
        <Meta label="Capabilities" value={view.capabilities.join(", ") || "None advertised"} />
        <Meta label="Source" value={<SourceLink source={source} />} />
      </dl>
    </section>
  );
}

function OperationPanel({ operations }: { readonly operations: readonly ResourceOperationView[] }) {
  return (
    <section className="panel relationship-panel" aria-labelledby="resource-operations-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SAFE OPERATIONS</p>
          <h2 id="resource-operations-heading">Provider operation metadata</h2>
        </div>
        <span className="badge">{operations.length}</span>
      </div>
      <ul className="request-list">
        {operations.map((operation) => (
          <li className="request-row" key={operation.name}>
            <code>{operation.name}</code>
            <span>{statusLabel(operation.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MetadataPanel({ view }: { readonly view: ResourceView }) {
  const descriptor = view.descriptor;
  const cache = view.kind === "cache";
  return (
    <section className="panel json-panel" aria-labelledby="resource-policy-heading">
      <p className="eyebrow">DECLARED POLICY</p>
      <h2 id="resource-policy-heading">
        {cache ? "Cache schema and TTL" : "Bucket object policy"}
      </h2>
      {cache ? (
        <div className="route-contract-grid">
          <JsonPanel title="Key schema" value={descriptor.keySchema} />
          <JsonPanel title="Value schema" value={descriptor.valueSchema} />
        </div>
      ) : (
        <dl className="route-meta">
          <Meta label="Visibility" value={descriptor.visibility || "Unavailable"} />
          <Meta label="Maximum object bytes" value={formatNumber(descriptor.maxObjectBytes)} />
          <Meta
            label="Allowed content types"
            value={descriptor.allowedContentTypes?.join(", ") || "Provider default"}
          />
        </dl>
      )}
      {cache && (
        <dl className="route-meta">
          <Meta label="Default TTL" value={formatNumber(descriptor.defaultTtlMs)} />
          <Meta label="Maximum TTL" value={formatNumber(descriptor.maxTtlMs)} />
        </dl>
      )}
      {cache && (
        <p className="supporting-copy">
          Raw cache keys and values are never returned to the browser.
        </p>
      )}
    </section>
  );
}

function StatsPanel({ stats }: { readonly stats: Readonly<Record<string, number>> }) {
  return (
    <section className="panel" aria-labelledby="resource-stats-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SAFE RUNTIME STATE</p>
          <h2 id="resource-stats-heading">Counters</h2>
        </div>
      </div>
      <dl className="overview-metrics">
        {Object.entries(stats).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value.toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function JsonPanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return <SchemaPanel title={title} value={value} eyebrow="SAFE SCHEMA" />;
}

function Meta({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function statusLabel(status: OperationStatus): string {
  return status === "declared"
    ? "Contract operation"
    : status === "supported"
      ? "Provider capability"
      : status === "unsupported"
        ? "Unsupported"
        : "Not advertised";
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "Provider default" : value.toLocaleString("en-US");
}
