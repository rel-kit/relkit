import { openApiOperation } from "../../lib/route-openapi";
import type { InspectorObject } from "../../lib/api-types";
import { SCALAR_API_REFERENCE_URL } from "../../lib/api-reference";
import { signalKey } from "../../lib/observability-model";
import { SourceLink } from "../source-link";
import { SchemaPanel } from "../schema-panel";

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
        <p className="supporting-copy">
          <a className="text-link" href={SCALAR_API_REFERENCE_URL} target="_blank" rel="noreferrer">
            Explore this operation in the active Scalar API Reference{" "}
            <span aria-hidden="true">→</span>
          </a>
        </p>
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
      <RouteMiddleware value={config?.middleware} />
      <RecentRequests requests={requests} />
    </>
  );
}

function RouteMiddleware({ value }: { readonly value: unknown }) {
  const middleware = Array.isArray(value)
    ? value.flatMap((item) => (record(item) ? [item] : []))
    : [];
  return (
    <section className="panel" aria-labelledby="route-middleware-heading">
      <div className="section-heading">
        <h2 id="route-middleware-heading">Middleware</h2>
        <span className="badge">{middleware.length}</span>
      </div>
      {middleware.length === 0 ? (
        <p className="supporting-copy">No middleware matches this route.</p>
      ) : (
        <ul className="request-list">
          {middleware.map((item) => (
            <li className="request-row" key={text(item.id)}>
              <a className="text-link" href={`/middlewares/${encodeURIComponent(text(item.id))}`}>
                {text(item.id)}
              </a>
              <span>
                <code>{text(item.path)}</code> · {text(item.match)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
          {requests.map((request) => (
            <RequestRow key={signalKey(request)} request={request} />
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
  return <SchemaPanel title={title} value={value} eyebrow="CONTRACT DATA" />;
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}
