"use client";

import { useEffect, useState } from "react";
import type { InspectorObject, InspectorPage } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";

export function FunctionsClient() {
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    void createInspectorClient()
      .list<InspectorObject>("functions", { limit: 100 })
      .then((payload: InspectorPage<InspectorObject>) => {
        setItems(payload.items);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Functions</h1>
          <p className="lede">
            Inspect contracts, dependencies, edges, limits, and local execution.
          </p>
        </div>
        <span className="badge">{items.length} functions</span>
      </header>
      {state === "loading" && (
        <p className="panel route-state" role="status">
          Loading functions…
        </p>
      )}
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The function API is unavailable.
        </p>
      )}
      {state === "ready" && items.length === 0 && (
        <p className="panel route-state">No functions are reported by the active graph.</p>
      )}
      {items.length > 0 && (
        <ul className="route-list">
          {items.map((item) => (
            <FunctionRow key={text(item.id)} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FunctionRow({ item }: { readonly item: InspectorObject }) {
  const id = text(item.id) || "function";
  const timeout = item.timeoutMs === null ? "default timeout" : value(item.timeoutMs, "timeout");
  const concurrency =
    item.concurrency === null ? "default concurrency" : value(item.concurrency, "concurrency");
  return (
    <li className="panel route-row">
      <div>
        <strong>{id}</strong>
        <p className="supporting-copy">
          {timeout} · {concurrency}
        </p>
      </div>
      <div className="route-row-detail">
        <span>Input: {schemaType(item.input)}</span>
        <span>Output: {schemaType(item.output)}</span>
      </div>
      <a className="text-link" href={`/functions/${encodeURIComponent(id)}`}>
        Open function <span aria-hidden="true">→</span>
      </a>
    </li>
  );
}

function schemaType(value: unknown): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const type = (value as InspectorObject).type;
    return typeof type === "string" ? type : "schema";
  }
  return "not declared";
}
function value(input: unknown, label: string): string {
  return `${label} ${typeof input === "number" ? input.toLocaleString("en-US") : "configured"}`;
}
function text(input: unknown): string {
  return typeof input === "string" ? input : "";
}
