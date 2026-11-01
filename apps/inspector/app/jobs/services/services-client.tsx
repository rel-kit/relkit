"use client";

import { useEffect, useMemo, useState } from "react";
import type { InspectorObject } from "../../../lib/api-types";
import { jobsNotMounted, NO_JOBS_MESSAGE } from "../../../lib/api-request-utils";
import { createInspectorClient } from "../../../lib/client";
import { Server } from "lucide-react";
import { FailedState, LoadingRows } from "../../../components/blocks/block-state";
import { PageHeader } from "../../../components/blocks/page-header";
import { EmptyState } from "../../../components/neon/empty-state";
import { StatusBadge, statusTone } from "../../../components/neon/status-badge";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
} from "../../../components/ui/table";
import { record, text } from "../job-format";
import { JobsTabs } from "../jobs-tabs";

export function JobsServicesClient() {
  const api = useMemo(() => createInspectorClient(), []);
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "absent">("loading");
  useEffect(() => {
    void api
      .jobServices<InspectorObject>()
      .then((result) => {
        setItems(result.items);
        setState("ready");
      })
      .catch((error: unknown) => setState(jobsNotMounted(error) ? "absent" : "error"));
  }, [api]);
  return (
    <>
      <JobsTabs />
      <div className="route-page">
        <PageHeader
          title="Services"
          description="Configured jobs providers, capabilities, generations, and health."
        />
        {state === "loading" && (
          <div className="rounded-lg border border-border bg-card">
            <LoadingRows label="Loading services…" rows={3} />
          </div>
        )}
        {state === "error" && <FailedState title="Jobs services are unavailable." />}
        {state === "absent" && (
          <EmptyState
            icon={<Server />}
            title={<span role="status">{NO_JOBS_MESSAGE}</span>}
            description="A jobs service is mounted once the application declares a job."
          />
        )}
        {state === "ready" && <ServiceTable items={items} />}
      </div>
    </>
  );
}

function ServiceTable({ items }: { readonly items: readonly InspectorObject[] }) {
  return (
    <DataTable>
      <caption className="sr-only">Jobs services</caption>
      <thead>
        <tr>
          <DataTableHead>Service</DataTableHead>
          <DataTableHead>Generation</DataTableHead>
          <DataTableHead>Provider</DataTableHead>
          <DataTableHead>Health</DataTableHead>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <DataTableEmpty>No jobs services are configured.</DataTableEmpty>
          </tr>
        ) : (
          items.map((item) => {
            const health = text(record(item.health)?.state) || "unknown";
            return (
              <tr key={text(item.service)} className="transition-colors hover:bg-muted/40">
                <th
                  scope="row"
                  className="border-b border-border/70 px-3 py-2 text-left font-mono text-xs font-medium"
                >
                  {text(item.service) || "unknown"}
                </th>
                <DataTableCell className="font-mono text-xs text-muted-foreground">
                  {text(item.serviceGeneration) || "—"}
                </DataTableCell>
                <DataTableCell className="font-mono text-xs">
                  {text(item.provider) || "—"}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge tone={statusTone(health)} label={health} />
                </DataTableCell>
              </tr>
            );
          })
        )}
      </tbody>
    </DataTable>
  );
}
