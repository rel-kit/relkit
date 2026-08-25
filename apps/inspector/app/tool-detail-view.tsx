import type { InspectorApiClient } from "../lib/api";
import type { ToolApprovalView, ToolView } from "../lib/agents-model";
import { ToolApprovalActions } from "./tool-approval-actions";
import { SchemaPanel } from "./schema-panel";

export function ToolDetailView({
  api,
  view,
  capabilities,
  generationId,
  graphHash,
  onComplete,
}: {
  readonly api: InspectorApiClient;
  readonly view: ToolView;
  readonly capabilities: readonly string[];
  readonly generationId: string;
  readonly graphHash: string;
  readonly onComplete: () => Promise<void>;
}) {
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Tool detail</h1>
          <p className="lede">A tool exposes one function contract and never owns a handler.</p>
        </div>
        <span className="badge">{view.id}</span>
      </header>
      <section className="panel route-identity" aria-labelledby="tool-identity-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TOOL POLICY</p>
            <h2 id="tool-identity-heading">{view.description || view.id}</h2>
          </div>
          <span className="badge">{view.sideEffect}</span>
        </div>
        <dl className="route-meta">
          <Meta label="Target function" value={view.targetFunctionId || "Unavailable"} />
          <Meta label="Approval" value={view.approvalPolicy} />
          <Meta
            label="Timeout"
            value={view.timeoutMs === undefined ? "Provider default" : `${view.timeoutMs} ms`}
          />
        </dl>
      </section>
      <div className="route-contract-grid">
        <JsonPanel title="Inherited input schema" value={view.input} />
        <JsonPanel title="Inherited output schema" value={view.output} />
        <JsonPanel title="Inherited errors" value={view.errors} />
      </div>
      <ApprovalPanel
        approvals={view.pendingApprovals}
        api={api}
        capabilities={capabilities}
        generationId={generationId}
        graphHash={graphHash}
        onComplete={onComplete}
      />
      <TimelinePanel view={view} />
    </div>
  );
}

function ApprovalPanel({
  approvals,
  ...props
}: { readonly approvals: readonly ToolApprovalView[] } & Omit<
  Parameters<typeof ToolApprovalActions>[0],
  "approval"
>) {
  return (
    <section className="panel" aria-labelledby="tool-approvals-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PROTECTED ACTIONS</p>
          <h2 id="tool-approvals-heading">Pending approvals</h2>
        </div>
        <span className="badge">{approvals.length}</span>
      </div>
      {approvals.length === 0 ? (
        <p className="supporting-copy">No pending approval metadata is available.</p>
      ) : (
        <ul className="request-list">
          {approvals.map((approval) => (
            <li className="request-row" key={`${approval.invocationId}:${approval.toolCallId}`}>
              <span>
                <strong>{approval.toolCallId}</strong>
                <br />
                <small>
                  Invocation {approval.invocationId} ·{" "}
                  {approval.sideEffect || "side effect unavailable"}
                </small>
              </span>
              <ToolApprovalActions {...props} approval={approval} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TimelinePanel({ view }: { readonly view: ToolView }) {
  return (
    <section className="panel" aria-labelledby="tool-timeline-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">INVOCATION TIMELINE</p>
          <h2 id="tool-timeline-heading">Safe execution metadata</h2>
        </div>
        <span className="badge">{view.timeline.length}</span>
      </div>
      {view.timeline.length === 0 ? (
        <p className="supporting-copy">No invocation or span metadata is available.</p>
      ) : (
        <ul className="request-list">
          {view.timeline.map((entry) => (
            <li className="request-row" key={`${entry.kind}:${entry.id}`}>
              <span>
                <strong>{entry.kind}</strong> <code>{entry.id}</code>
              </span>
              <span>
                {entry.status || "recorded"}
                {entry.outcome ? ` · ${entry.outcome}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="supporting-copy">
        Prompt, tool arguments, and model results are not rendered by default.
      </p>
    </section>
  );
}

function JsonPanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return <SchemaPanel title={title} value={value} eyebrow="SAFE SCHEMA" />;
}
function Meta({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
