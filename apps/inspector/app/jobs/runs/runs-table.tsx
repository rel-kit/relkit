import Link from "next/link";
import type { InspectorObject } from "../../../lib/api-types";

export function RunsTable({ items }: { readonly items: readonly InspectorObject[] }) {
  return items.length === 0 ? (
    <p className="panel route-state">No runs match these filters.</p>
  ) : (
    <div className="panel overflow-x-auto">
      <table className="resource-table">
        <caption className="sr-only">Job runs</caption>
        <thead>
          <tr>
            <th scope="col">Run ID</th>
            <th scope="col">Job</th>
            <th scope="col">Status</th>
            <th scope="col">Accepted</th>
            <th scope="col">Service</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const id = text(item.runId);
            return (
              <tr key={id}>
                <th scope="row">
                  <Link href={`/jobs/runs/${encodeURIComponent(id)}`}>{id || "unknown"}</Link>
                </th>
                <td>{text(item.jobId) || "—"}</td>
                <td aria-label={`Status ${text(item.status) || "unknown"}`}>
                  {text(item.status) || "unknown"}
                </td>
                <td>{text(item.acceptedAt) || "—"}</td>
                <td>{text(item.service) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
