"use client";

import { useEffect, useMemo, useState } from "react";
import type { InspectorObject } from "../../../lib/api-types";
import { createInspectorClient } from "../../../lib/client";
import { JobsTabs } from "../jobs-tabs";

export function JobsServicesClient() {
  const api = useMemo(() => createInspectorClient(), []);
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => { void api.jobServices<InspectorObject>().then((result) => { setItems(result.items); setState("ready"); }).catch(() => setState("error")); }, [api]);
  return <><JobsTabs /><main className="route-page"><header className="page-heading"><div><p className="eyebrow">JOBS / SERVICES</p><h1>Services</h1><p className="lede">Configured jobs providers, capabilities, generations, and health.</p></div></header>{state === "loading" && <p className="panel route-state" role="status">Loading services…</p>}{state === "error" && <p className="panel route-state" role="alert">Jobs services are unavailable.</p>}{state === "ready" && <ServiceTable items={items} />}</main></>;
}

function ServiceTable({ items }: { readonly items: readonly InspectorObject[] }) {
  return items.length === 0 ? <p className="panel route-state">No jobs services are configured.</p> : <div className="panel overflow-x-auto"><table className="resource-table"><caption className="sr-only">Jobs services</caption><thead><tr><th scope="col">Service</th><th scope="col">Generation</th><th scope="col">Provider</th><th scope="col">Health</th></tr></thead><tbody>{items.map((item) => <tr key={text(item.service)}><th scope="row">{text(item.service) || "unknown"}</th><td>{text(item.serviceGeneration) || "—"}</td><td>{text(item.provider) || "—"}</td><td>{health(item.health)}</td></tr>)}</tbody></table></div>;
}
function health(value: unknown): string { const item = value !== null && typeof value === "object" && !Array.isArray(value) ? value as InspectorObject : undefined; return text(item?.state) || "unknown"; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
