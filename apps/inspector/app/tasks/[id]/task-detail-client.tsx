"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ContentTabs } from "../../../components/ui/tabs";
import type { InspectorObject } from "../../../lib/api-types";
import { createInspectorClient } from "../../../lib/client";

export function TaskDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const api = useMemo(() => createInspectorClient(), []);
  const [task, setTask] = useState<InspectorObject>();
  const [error, setError] = useState(false);
  useEffect(() => { if (id === "") return; void api.taskDefinition<InspectorObject>(id).then((result) => { setTask(record(result.task) ?? record(result)); }).catch(() => setError(true)); }, [api, id]);
  if (error) return <main className="route-page"><p className="panel route-state" role="alert">The task definition is unavailable.</p></main>;
  if (task === undefined) return <main className="route-page"><p className="panel route-state" role="status">Loading task definition…</p></main>;
  return <main className="route-page"><header className="page-heading"><div><p className="eyebrow">TASK DETAIL</p><h1>{text(task.taskId) || id}</h1><p className="lede">Task schema, dependencies, policy, hooks, versions, and worker capabilities.</p></div><span className="badge">{text(task.version) || "unversioned"}</span></header><p className="supporting-copy"><Link href="/jobs">Back to job definitions</Link></p><ContentTabs label="Task detail sections" items={[{ id: "schema", label: "Schema", content: <JsonPanel value={{ input: task.input, output: task.output, errors: task.errors, schemaHashes: task.schemaHashes }} /> }, { id: "context", label: "Context dependencies", content: <JsonPanel value={{ dependencies: task.dependencies, publishes: task.publishes }} /> }, { id: "policy", label: "Policy & resources", content: <JsonPanel value={{ policy: task.policy, resources: task.resources, concurrency: task.concurrency }} /> }, { id: "hooks", label: "Lifecycle hooks", content: <JsonPanel value={{ onStart: task.onStart, onSuccess: task.onSuccess, onFailure: task.onFailure }} /> }, { id: "capabilities", label: "Native capabilities", content: <JsonPanel value={{ capabilities: task.capabilities, worker: task.worker, health: task.health }} /> }]} /></main>;
}
function JsonPanel({ value }: { readonly value: InspectorObject }) { return <pre className="safe-json">{JSON.stringify(value, null, 2)}</pre>; }
function record(value: unknown): InspectorObject | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as InspectorObject : undefined; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
