import type {
  EnvironmentFieldView,
  EnvironmentSnapshot,
  GenerationView,
} from "../lib/env-diagnostics-model";
import { SourceLink } from "./source-link";

export function EnvironmentView({
  snapshot,
  state,
  liveState,
}: {
  readonly snapshot: EnvironmentSnapshot | undefined;
  readonly state: "loading" | "ready" | "error";
  readonly liveState: string;
}) {
  const active = snapshot?.active;
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Environment</h1>
          <p className="lede">Value-free environment contract metadata from the active graph.</p>
        </div>
        <div className="signal-status" role="status" aria-live="polite">
          <span className="badge">Live: {liveState}</span>
          {state === "loading" && <span>Refreshing metadata…</span>}
        </div>
      </header>
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The environment API is unavailable. Previously loaded active metadata remains visible.
        </p>
      )}
      {state === "loading" && snapshot === undefined && (
        <p className="panel route-state" role="status">
          Loading active environment metadata…
        </p>
      )}
      {active !== undefined && <GenerationPanel identity={active} label="Active generation" />}
      {snapshot !== undefined && (
        <EnvironmentPanel title="Active environment contract" fields={snapshot.fields} />
      )}
    </div>
  );
}

function GenerationPanel({
  identity,
  label,
}: {
  readonly identity: GenerationView;
  readonly label: string;
}) {
  return (
    <section className="panel identity-panel" aria-labelledby="environment-identity-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LAST KNOWN GOOD</p>
          <h2 id="environment-identity-heading">{label}</h2>
        </div>
        <span className="badge">{identity.role}</span>
      </div>
      <GenerationIdentity identity={identity} />
    </section>
  );
}

function GenerationIdentity({ identity }: { readonly identity: GenerationView }) {
  return (
    <dl className="identity-grid">
      <div>
        <dt>Generation ID</dt>
        <dd>{identity.generationId}</dd>
      </div>
      <div>
        <dt>Graph hash</dt>
        <dd>{identity.graphHash}</dd>
      </div>
    </dl>
  );
}

function EnvironmentPanel({
  title,
  fields,
}: {
  readonly title: string;
  readonly fields: readonly EnvironmentFieldView[];
}) {
  return (
    <section className="panel" aria-labelledby="environment-fields-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DECLARED METADATA</p>
          <h2 id="environment-fields-heading">{title}</h2>
        </div>
        <span className="badge">{fields.length} variables</span>
      </div>
      <EnvironmentRows fields={fields} />
    </section>
  );
}

function EnvironmentRows({ fields }: { readonly fields: readonly EnvironmentFieldView[] }) {
  if (fields.length === 0) return <p className="supporting-copy">No variables are declared.</p>;
  return (
    <ul className="request-list">
      {fields.map((field) => (
        <li className="request-row" key={field.name}>
          <div>
            <strong>{field.name}</strong>
            <p className="supporting-copy">{field.description ?? "No description provided."}</p>
          </div>
          <div className="route-row-detail">
            <span>Type: {field.type}</span>
            <span>{requirement(field)}</span>
            <span>{field.hasDefault ? "Default declared" : "No default"}</span>
            <span>{field.sensitive ? "Sensitive" : "Non-sensitive"}</span>
            {field.source !== undefined && (
              <span>
                Source: <SourceLink source={field.source} />
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function requirement(field: EnvironmentFieldView): string {
  if (field.requiredIn.length > 0) return `Required in ${field.requiredIn.join(", ")}`;
  return field.optional ? "Optional" : "Required by default";
}
