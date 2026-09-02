"use client";

import type { InspectorObject } from "../lib/api-types";
import { useRuntimeMetadata } from "../lib/use-runtime-metadata";

export function RuntimeStatus({ telemetryOnly = false }: { readonly telemetryOnly?: boolean }) {
  const state = useRuntimeMetadata();
  if (state.loading)
    return (
      <p className="panel route-state" role="status">
        Loading runtime metadata…
      </p>
    );
  if (state.failed || state.value === undefined)
    return (
      <p className="panel route-state" role="alert">
        Runtime metadata is unavailable.
      </p>
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

function LocalServices({ value }: { readonly value?: InspectorObject }) {
  const items = records(value?.items);
  const lease = record(value?.lease);
  return (
    <section className="panel" aria-labelledby="local-services-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LOCAL LIFECYCLE</p>
          <h2 id="local-services-heading">Local services</h2>
        </div>
        <span className="badge">{items.length}</span>
      </div>
      <p className="supporting-copy">
        Lease: {text(lease?.mode, "not active")} · {text(lease?.status, "unowned")}
      </p>
      {items.length === 0 ? (
        <p className="supporting-copy">No local service plan is active.</p>
      ) : (
        <ul className="request-list">
          {items.map((item) => (
            <li className="request-row" key={text(item.bindingId, JSON.stringify(item))}>
              <span>
                <strong>{text(item.bindingId, "Unknown binding")}</strong>
                <br />
                <small>
                  {text(item.capability, "capability unavailable")} ·{" "}
                  {text(item.profile, "default")}
                </small>
              </span>
              <span className="badge">{text(item.phase, "planned")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Telemetry({ value }: { readonly value?: InspectorObject }) {
  const sampling = record(value?.sampling);
  const counters = record(value?.counters);
  const exporters = records(value?.exporters);
  return (
    <section className="panel" aria-labelledby="telemetry-export-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">COMPLETE LOCAL EVIDENCE</p>
          <h2 id="telemetry-export-heading">External exporters</h2>
        </div>
        <span className="badge">{exporters.length}</span>
      </div>
      <p className="supporting-copy">
        Local records remain complete. External traces sample at {percent(sampling?.traceRate)};
        logs start at {text(sampling?.minimumLogLevel, "info")}; errors and diagnostics are always
        selected.
      </p>
      <dl className="overview-metrics">
        <Metric label="Persisted" value={count(counters?.persisted)} />
        <Metric label="Sampled out" value={count(counters?.sampledOut)} />
        <Metric label="Export failures" value={count(counters?.exportFailures)} />
      </dl>
      {exporters.length === 0 ? (
        <p className="supporting-copy">No external exporter configured.</p>
      ) : (
        <ul className="request-list">
          {exporters.map((item) => (
            <li className="request-row" key={text(item.name, JSON.stringify(item))}>
              <span>
                <strong>{text(item.name, "Exporter")}</strong>
                <br />
                <small>
                  {text(item.integrationId, "integration unavailable")} · exported{" "}
                  {count(item.exported)} · dropped {count(item.droppedRecords)}
                </small>
              </span>
              <span className="badge">{item.healthy === true ? "Healthy" : "Degraded"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
