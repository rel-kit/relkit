"use client";

import Link from "next/link";
import type { InspectorObject } from "../../lib/api-types";
import type { JobAction } from "../../lib/job-actions";

export function ModernJobDetail({
  actionError,
  definition,
  runs,
  onAction,
  pending,
}: {
  readonly actionError: string;
  readonly definition: InspectorObject;
  readonly runs: readonly InspectorObject[];
  readonly onAction: (action: JobAction, runId: string) => Promise<void>;
  readonly pending: boolean;
}) {
  const taskId = text(definition.taskId);
  const schedules = Array.isArray(definition.schedules) ? definition.schedules : [];
  return <div className="route-page"><header className="page-heading"><div><p className="eyebrow">JOB DEFINITION</p><h1>{text(definition.name) || text(definition.jobId) || "Job"}</h1><p className="lede">Durable definition identity stays separate from retained run history.</p></div><span className="badge">{text(definition.jobId) || text(definition.id)}</span></header>{actionError !== "" && <p className="field-errors" role="alert">{actionError}</p>}<section className="panel"><dl className="identity-grid"><Meta label="Binding" value={definition.implicit === true ? "implicit" : definition.default === true ? "default" : "explicit"} /><Meta label="Task" value={taskId === "" ? "—" : taskId} /><Meta label="Version / build" value={`${text(definition.taskVersion) || "—"} / ${text(definition.buildId) || "—"}`} /><Meta label="Service" value={`${text(definition.service) || "—"} (${text(definition.serviceGeneration) || "current"})`} /><Meta label="Execution" value={text(definition.execution) || "unknown"} /><Meta label="Health" value={text(definition.health) || "unknown"} /><Meta label="Retired" value={definition.retired === true ? "yes" : "no"} /><Meta label="Schedules" value={String(schedules.length)} /></dl></section><section className="route-contract-grid"><JsonPanel title="Task schema" value={definition.schema} /><JsonPanel title="Policy, resources & capabilities" value={{ policy: definition.policy, resources: definition.resources, capabilities: definition.capabilities, worker: definition.worker }} /></section>{taskId !== "" && <p className="supporting-copy"><Link href={`/tasks/${encodeURIComponent(taskId)}`}>Open task detail</Link></p>}<section className="panel" aria-labelledby="job-runs-heading"><div className="section-heading"><h2 id="job-runs-heading">Recent runs</h2><span className="badge">{runs.length}</span></div>{runs.length === 0 ? <p className="supporting-copy">No history exists for this definition.</p> : <div className="overflow-x-auto"><table className="resource-table"><caption className="sr-only">Recent runs</caption><thead><tr><th scope="col">Run ID</th><th scope="col">Status</th><th scope="col">Accepted</th><th scope="col">Actions</th></tr></thead><tbody>{runs.map((run) => { const id = text(run.runId); const active = isActive(text(run.status)); return <tr key={id}><th scope="row"><Link href={`/jobs/runs/${encodeURIComponent(id)}`}>{id || "unknown"}</Link></th><td>{text(run.status) || "unknown"}</td><td>{text(run.acceptedAt) || "—"}</td><td className="flex gap-2"><button className="button button-secondary" disabled={pending || !active} onClick={() => void onAction("cancel", id)} type="button">Cancel</button><button className="button button-secondary" disabled={pending || active} onClick={() => void onAction("retry", id)} type="button">Retry</button></td></tr>; })}</tbody></table></div>}</section></div>;
}

function JsonPanel({ title, value }: { readonly title: string; readonly value: unknown }) { return <section className="panel"><h2>{title}</h2><pre className="safe-json">{JSON.stringify(value ?? null, null, 2)}</pre></section>; }
function Meta({ label, value }: { readonly label: string; readonly value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function isActive(value: string): boolean { return ["queued", "delayed", "running", "sleeping", "retrying"].includes(value); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
