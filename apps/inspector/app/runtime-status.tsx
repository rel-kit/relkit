"use client";

import { Cable, Send } from "lucide-react";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { EmptyState } from "../components/neon/empty-state";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import type { InspectorObject } from "../lib/api-types";
import { useRuntimeMetadata } from "../lib/use-runtime-metadata";
import { LiveHistoryStatus } from "./history-status";
import { HeadedSection } from "./overview/headed-section";

/**
 * Local service lifecycle and telemetry export status.
 * @param props.telemetryOnly - Signals pages show only the exporter section.
 * @param props.history - Overview reports history storage in its health strip instead.
 */
export function RuntimeStatus({
  telemetryOnly = false,
  history = true,
}: {
  readonly telemetryOnly?: boolean;
  readonly history?: boolean;
}) {
  return (
    <>
      {history && <LiveHistoryStatus />}
      <RuntimeMetadata telemetryOnly={telemetryOnly} />
    </>
  );
}

function RuntimeMetadata({ telemetryOnly }: { readonly telemetryOnly: boolean }) {
  const state = useRuntimeMetadata();
  if (state.loading) return <LoadingRows label="Loading runtime metadata" rows={3} />;
  if (state.failed || state.value === undefined)
    return (
      <FailedState
        title="Runtime metadata is unavailable."
        description="Local service and exporter status return when the backend reconnects."
      />
    );
  const local = record(state.value.localServices);
  const telemetry = record(state.value.telemetry);
  return (
    <>
      {!telemetryOnly && <LocalServices value={local} />}
      <Telemetry value={telemetry} />
    </>
  );
}

function LocalServices({ value }: { readonly value?: InspectorObject | undefined }) {
  const items = records(value?.items);
  const lease = record(value?.lease);
  return (
    <HeadedSection
      aria-labelledby="local-services-heading"
      kicker="LOCAL LIFECYCLE"
      title="Local services"
      flush
      actions={
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {items.length}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wide">Lease</span>
        <StatusBadge
          tone={lease?.mode === undefined ? "neutral" : statusTone(text(lease?.status, ""))}
          label={`${text(lease?.mode, "not active")} · ${text(lease?.status, "unowned")}`}
        />
      </div>
      {items.length === 0 ? (
        <EmptyState
          variant="bare"
          size="sm"
          icon={<Cable />}
          title="No local service plan is active."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <li
              className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2 last:border-b-0"
              key={text(item.bindingId, JSON.stringify(item))}
            >
              <span className="flex min-w-0 flex-col">
                <code className="truncate bg-transparent p-0 text-xs text-foreground">
                  {text(item.bindingId, "Unknown binding")}
                </code>
                <span className="truncate text-[11px] text-muted-foreground">
                  {text(item.capability, "capability unavailable")} ·{" "}
                  {text(item.profile, "default")}
                </span>
              </span>
              <StatusBadge
                tone={statusTone(text(item.phase, "planned"))}
                label={text(item.phase, "planned")}
              />
            </li>
          ))}
        </ul>
      )}
    </HeadedSection>
  );
}

function Telemetry({ value }: { readonly value?: InspectorObject | undefined }) {
  const sampling = record(value?.sampling);
  const counters = record(value?.counters);
  const exporters = records(value?.exporters);
  const failures = count(counters?.exportFailures);
  return (
    <HeadedSection
      aria-labelledby="telemetry-export-heading"
      kicker="APPLICATION EXPORT STATUS"
      title="External exporters"
      flush
      actions={
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {exporters.length}
        </span>
      }
    >
      <p className="m-0 border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
        Local capture is bounded. External traces sample at{" "}
        <span className="font-mono text-foreground">{percent(sampling?.traceRate)}</span>; logs
        start at{" "}
        <span className="font-mono text-foreground">{text(sampling?.minimumLogLevel, "info")}</span>
        ; errors and diagnostics are always selected.
      </p>
      <ul className="m-0 list-none border-b border-border/60 p-0 py-1">
        <Metric label="Accepted by app capture" value={count(counters?.persisted)} />
        <Metric label="Sampled out" value={count(counters?.sampledOut)} />
        <Metric
          label="Export failures"
          value={failures}
          tone={failures === "0" ? undefined : "danger"}
        />
      </ul>
      {exporters.length === 0 ? (
        <EmptyState
          variant="bare"
          size="sm"
          icon={<Send />}
          title="No external exporter configured."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {exporters.map((item) => (
            <li
              className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2 last:border-b-0"
              key={text(item.name, JSON.stringify(item))}
            >
              <span className="flex min-w-0 flex-col">
                <code className="truncate bg-transparent p-0 text-xs text-foreground">
                  {text(item.name, "Exporter")}
                </code>
                <span className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                  {text(item.integrationId, "integration unavailable")} · exported{" "}
                  {count(item.exported)} · dropped {count(item.droppedRecords)}
                </span>
              </span>
              <StatusBadge
                tone={item.healthy === true ? "success" : "warning"}
                label={item.healthy === true ? "Healthy" : "Degraded"}
              />
            </li>
          ))}
        </ul>
      )}
    </HeadedSection>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "danger" | undefined;
}) {
  return (
    <li className="flex min-w-0 items-baseline justify-between gap-3 px-4 py-1">
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={
          tone === "danger"
            ? "m-0 font-mono text-xs text-danger tabular-nums"
            : "m-0 font-mono text-xs text-foreground tabular-nums"
        }
      >
        {value}
      </span>
    </li>
  );
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function records(value: unknown): InspectorObject[] {
  return Array.isArray(value) ? value.flatMap((item) => (record(item) ? [record(item)!] : [])) : [];
}
function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}
function count(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString("en-US")
    : "0";
}
function percent(value: unknown): string {
  return typeof value === "number" && value >= 0 && value <= 1
    ? `${Math.round(value * 100)}%`
    : "100%";
}
