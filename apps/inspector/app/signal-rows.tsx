import { Badge } from "../components/ui/badge";
import { DataTable, DataTableCell, DataTableEmpty, DataTableHead } from "../components/ui/table";
import type { InspectorObject } from "../lib/api-types";
import { traceGroups, signalKey, type SignalKind, text, number } from "../lib/observability-model";

export function SignalRows({
  kind,
  items,
}: {
  readonly kind: SignalKind;
  readonly items: readonly InspectorObject[];
}) {
  if (kind === "requests") return <RequestTable items={items} />;
  if (kind === "logs") return <LogTable items={items} />;
  return <TraceTable items={items} />;
}

function RequestTable({ items }: { readonly items: readonly InspectorObject[] }) {
  return (
    <DataTable>
      <caption className="sr-only">Request results</caption>
      <thead>
        <tr>
          <DataTableHead>Request</DataTableHead>
          <DataTableHead>Route</DataTableHead>
          <DataTableHead>Outcome</DataTableHead>
          <DataTableHead>Time</DataTableHead>
          <DataTableHead>Action</DataTableHead>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <DataTableEmpty>No retained requests match the active filters.</DataTableEmpty>
          </tr>
        ) : (
          items.map((item) => {
            const id = text(item.requestId);
            return (
              <tr key={signalKey(item)}>
                <DataTableCell>
                  <code>{bounded(id || "unavailable")}</code>
                </DataTableCell>
                <DataTableCell>
                  <strong>{text(item.method) || "HTTP"}</strong>{" "}
                  {text(item.normalizedRoute) || text(item.rawPath) || "request"}
                </DataTableCell>
                <DataTableCell>
                  <Badge>{text(item.outcome) || "unknown"}</Badge> HTTP {number(item.status) ?? "—"}
                </DataTableCell>
                <DataTableCell>
                  {bounded(text(item.completedAt) || text(item.startedAt) || "unavailable")}
                </DataTableCell>
                <DataTableCell>
                  {id === "" ? (
                    "Unavailable"
                  ) : (
                    <a className="text-link" href={`/requests/${encodeURIComponent(id)}`}>
                      Open request
                    </a>
                  )}
                </DataTableCell>
              </tr>
            );
          })
        )}
      </tbody>
    </DataTable>
  );
}

function LogTable({ items }: { readonly items: readonly InspectorObject[] }) {
  return (
    <DataTable>
      <caption className="sr-only">Log results</caption>
      <thead>
        <tr>
          <DataTableHead>Message</DataTableHead>
          <DataTableHead>Context</DataTableHead>
          <DataTableHead>Time</DataTableHead>
          <DataTableHead>Links</DataTableHead>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <DataTableEmpty>No retained logs match the active filters.</DataTableEmpty>
          </tr>
        ) : (
          items.map((item) => {
            const requestId = text(item.requestId) || text(item.correlationId);
            const traceId = text(item.traceId);
            return (
              <tr key={signalKey(item)}>
                <DataTableCell>
                  <strong>{bounded(text(item.message) || "Structured log")}</strong>
                </DataTableCell>
                <DataTableCell>
                  <Badge>{text(item.level) || "unknown"}</Badge>{" "}
                  {text(item.component) || "component unavailable"}
                </DataTableCell>
                <DataTableCell>{bounded(text(item.timestamp) || "unavailable")}</DataTableCell>
                <DataTableCell>
                  <span className="request-links">
                    {requestId && (
                      <a className="text-link" href={`/requests/${encodeURIComponent(requestId)}`}>
                        Request
                      </a>
                    )}
                    {traceId && (
                      <a className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
                        Trace
                      </a>
                    )}
                  </span>
                </DataTableCell>
              </tr>
            );
          })
        )}
      </tbody>
    </DataTable>
  );
}

function TraceTable({ items }: { readonly items: readonly InspectorObject[] }) {
  const groups = traceGroups(items);
  return (
    <DataTable>
      <caption className="sr-only">Trace results</caption>
      <thead>
        <tr>
          <DataTableHead>Trace</DataTableHead>
          <DataTableHead>Outcome</DataTableHead>
          <DataTableHead>Duration</DataTableHead>
          <DataTableHead>Started</DataTableHead>
          <DataTableHead>Action</DataTableHead>
        </tr>
      </thead>
      <tbody>
        {groups.length === 0 ? (
          <tr>
            <DataTableEmpty>No retained traces match the active filters.</DataTableEmpty>
          </tr>
        ) : (
          groups.map((group) => (
            <tr key={group.traceId}>
              <DataTableCell>
                <code>{bounded(group.traceId)}</code>
              </DataTableCell>
              <DataTableCell>
                <Badge>{group.outcome || "unknown"}</Badge> · {group.spans.length} spans
              </DataTableCell>
              <DataTableCell>
                {group.durationMs === undefined ? "Unavailable" : `${group.durationMs} ms`}
              </DataTableCell>
              <DataTableCell>{bounded(group.startedAt || "unavailable")}</DataTableCell>
              <DataTableCell>
                <a className="text-link" href={`/traces/${encodeURIComponent(group.traceId)}`}>
                  Open trace
                </a>
              </DataTableCell>
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  );
}

function bounded(value: string): string {
  return value.length <= 96 ? value : `${value.slice(0, 68)}…${value.slice(-20)}`;
}
