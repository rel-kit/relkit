"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { DetailList } from "../../components/blocks/details";
import { StatusBadge } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { unwrapSchema } from "../../lib/schema-model";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface FunctionItem extends ResourceTableItem {
  readonly input: string;
  readonly output: string;
  readonly timeout: string;
  readonly concurrency: string;
  readonly domain: string;
  readonly exposure: string;
  readonly mode: string;
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
          key: "domain",
          label: "Domain",
          render: (item) => (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <code className="bg-transparent p-0 font-mono text-xs text-muted-foreground">
                {item.domain}
              </code>
              {item.exposure === "internal" ? <Badge>internal</Badge> : null}
            </span>
          ),
        },
        {
          key: "contract",
          label: "Contract",
          render: (item) => (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
              <span className="text-foreground/85">{item.input}</span>
              <span aria-hidden="true">→</span>
              <span className="sr-only">returns</span>
              <span className="text-foreground/85">{item.output}</span>
            </span>
          ),
        },
        {
          key: "mode",
          label: "Invocation",
          render: (item) => (
            <StatusBadge tone={item.mode === "event-only" ? "info" : "neutral"} label={item.mode} />
          ),
        },
        {
          key: "limits",
          label: "Limits",
          render: (item) => (
            <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
              {item.timeout.startsWith("default") && item.concurrency.startsWith("default")
                ? "defaults"
                : `${item.timeout} · ${item.concurrency}`}
            </span>
          ),
        },
      ]}
      href={(item) => `/functions/${encodeURIComponent(item.id)}`}
      openLabel="Open function"
      details={(item) => (
        <DetailList
          columns={2}
          items={[
            { label: "Function ID", value: item.id, mono: true, copy: item.id },
            { label: "Domain", value: item.domain, mono: true },
            { label: "Input", value: item.input, mono: true },
            { label: "Output", value: item.output, mono: true },
            { label: "Invocation", value: item.mode, mono: true },
            { label: "Exposure", value: item.exposure, mono: true },
            { label: "Timeout", value: item.timeout, mono: true },
            { label: "Concurrency", value: item.concurrency, mono: true },
          ]}
        />
      )}
    />
  );
}

function functionItem(item: InspectorObject): FunctionItem {
  return {
    id: text(item.id) || "function",
    domain: text(item.domainId) || "unowned",
    exposure: text(item.exposure) || "internal",
    mode: text(item.invocationMode) || "callable",
    input: schemaType(item.input),
    output: schemaType(item.output),
    timeout: limit(item.timeoutMs, "ms", "timeout"),
    concurrency: limit(item.concurrency, "×", "concurrency"),
  };
}

function schemaType(value: unknown): string {
  const schema = record(unwrapSchema(value));
  const properties = record(schema?.properties);
  if (properties !== undefined) {
    const count = Object.keys(properties).length;
    return count === 0 ? "{}" : `${count} ${count === 1 ? "field" : "fields"}`;
  }
  return typeof schema?.type === "string" ? schema.type : "not declared";
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function limit(input: unknown, unit: string, label: string): string {
  if (input === null || input === undefined) return `default ${label}`;
  return typeof input === "number"
    ? unit === "ms"
      ? `${input.toLocaleString("en-US")} ms`
      : `${input.toLocaleString("en-US")}${unit} ${label}`
    : `${label} configured`;
}

function text(input: unknown): string {
  return typeof input === "string" ? input : "";
}
