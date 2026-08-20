"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface FunctionItem extends ResourceTableItem {
  readonly input: string;
  readonly output: string;
  readonly timeout: string;
  readonly concurrency: string;
}

export function FunctionsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<FunctionItem>> => {
    const page = await createInspectorClient().list<InspectorObject>("functions", query);
    return { ...page, items: page.items.map(functionItem) };
  }, []);
  return (
    <ResourceTable
      title="Functions"
      description="Inspect contracts, dependencies, edges, limits, and local execution."
      noun="functions"
      load={load}
      columns={[
        {
          key: "contract",
          label: "Contract",
          render: (item) => (
            <span>
              Input {item.input} · Output {item.output}
            </span>
          ),
        },
        {
          key: "limits",
          label: "Limits",
          render: (item) => (
            <span>
              {item.timeout} · {item.concurrency}
            </span>
          ),
        },
      ]}
      href={(item) => `/functions/${encodeURIComponent(item.id)}`}
      openLabel="Open function"
      details={(item) => (
        <dl className="identity-grid">
          <div>
            <dt>Input</dt>
            <dd>{item.input}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>{item.output}</dd>
          </div>
          <div>
            <dt>Timeout</dt>
            <dd>{item.timeout}</dd>
          </div>
          <div>
            <dt>Concurrency</dt>
            <dd>{item.concurrency}</dd>
          </div>
        </dl>
      )}
    />
  );
}

function functionItem(item: InspectorObject): FunctionItem {
  return {
    id: text(item.id) || "function",
    input: schemaType(item.input),
    output: schemaType(item.output),
    timeout: item.timeoutMs === null ? "default timeout" : value(item.timeoutMs, "timeout"),
    concurrency:
      item.concurrency === null ? "default concurrency" : value(item.concurrency, "concurrency"),
  };
}

function schemaType(value: unknown): string {
  const schema =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as InspectorObject)
      : undefined;
  return typeof schema?.type === "string" ? schema.type : "not declared";
}

function value(input: unknown, label: string): string {
  return `${label} ${typeof input === "number" ? input.toLocaleString("en-US") : "configured"}`;
}

function text(input: unknown): string {
  return typeof input === "string" ? input : "";
}
