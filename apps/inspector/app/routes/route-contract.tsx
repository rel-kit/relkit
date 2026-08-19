import { openApiOperation } from "../../lib/route-openapi";
import type { InspectorObject } from "../../lib/api-types";
import { SourceLink } from "../source-link";

export function RouteContract({
  route,
  target,
  requests,
}: {
  readonly route: InspectorObject;
  readonly target?: InspectorObject;
  readonly requests: readonly InspectorObject[];
}) {
  const config = record(route.config);
  const method = text(config?.method) ?? "HTTP";
  const path = text(config?.path) ?? "/";
  const targetId = text(route.targetFunctionId) ?? "unknown function";
  const source = record(route.source);
  return (
    <>
      <section className="panel route-identity" aria-labelledby="route-contract-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">HTTP CONTRACT</p>
            <h2 id="route-contract-heading">
              <span className="route-method">{method}</span> <code>{path}</code>
            </h2>
          </div>
          <span className="badge">{targetId}</span>
        </div>
        <dl className="route-meta">
          <div>
            <dt>Route ID</dt>
            <dd>{text(route.id) || "unknown"}</dd>
          </div>
          <div>
            <dt>Target function</dt>
            <dd>{targetId}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <SourceLink source={source} />
            </dd>
          </div>
        </dl>
      </section>
      <div className="route-contract-grid">
        <JsonPanel title="Request mapping" value={config?.request} />
        <JsonPanel title="Response mappings" value={config?.responses} />
        <JsonPanel
          title="Schemas"
          value={{ input: target?.input, output: target?.output, errors: target?.errors }}
        />
        <JsonPanel title="OpenAPI operation" value={openApiOperation(route, target)} />
      </div>
      <RecentRequests requests={requests} />
    </>
  );
}

function RecentRequests({ requests }: { readonly requests: readonly InspectorObject[] }) {
  return (
    <section className="panel" aria-labelledby="recent-requests-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">OBSERVABILITY</p>
          <h2 id="recent-requests-heading">Recent requests</h2>
        </div>
        <span className="badge">{requests.length}</span>
      </div>
      {requests.length === 0 ? (
        <p className="supporting-copy">No requests are retained for this route.</p>
      ) : (
        <ul className="request-list">
          {requests.map((request, index) => (
            <RequestRow key={text(request.requestId) || String(index)} request={request} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestRow({ request }: { readonly request: InspectorObject }) {
  const requestId = text(request.requestId);
  const traceId = text(request.traceId);
  return (
    <li className="request-row">
      <span>
        <strong>{text(request.method) || "HTTP"}</strong> {text(request.status) || ""}{" "}
        {text(request.outcome) || ""}
      </span>
      <span className="request-links">
        {requestId === "" ? (
          <span>Request ID unavailable</span>
        ) : (
          <a className="text-link" href={`/requests/${encodeURIComponent(requestId)}`}>
            request
          </a>
        )}
        {traceId === "" ? null : (
          <a className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
            trace
          </a>
        )}
      </span>
    </li>
  );
}

function JsonPanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return (
    <section className="panel json-panel" aria-labelledby={`${title}-heading`}>
      <p className="eyebrow">CONTRACT DATA</p>
      <h2 id={`${title}-heading`}>{title}</h2>
      <pre>{formatJson(value)}</pre>
    </section>
  );
}

function formatJson(value: unknown): string {
  if (value === undefined) return "Not declared";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unavailable";
  }
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}
