"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Copy, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { logDetail } from "../../lib/observability-api";
import { record, text } from "../../lib/observability-model";
import type { GraphSnapshot } from "../../lib/graph-model";
import { LogTrace } from "./log-trace";

export function LogDetails({
  cursor,
  graph,
  previous,
  next,
  onSelect,
  onClose,
}: {
  readonly cursor: string;
  readonly graph: GraphSnapshot | undefined;
  readonly previous: string;
  readonly next: string;
  readonly onSelect: (cursor: string) => void;
  readonly onClose: () => void;
}) {
  const [log, setLog] = useState<InspectorObject>();
  const [state, setState] = useState("loading");
  const [copyState, setCopyState] = useState("");
  useEffect(() => {
    let disposed = false;
    setState("loading");
    void logDetail(createInspectorClient(), cursor)
      .then((value) => {
        if (!disposed) {
          setLog(value.log);
          setState(value.log ? "ready" : "missing");
        }
      })
      .catch((error: unknown) => {
        if (!disposed) setState(record(error)?.status === 404 ? "missing" : "error");
      });
    return () => {
      disposed = true;
    };
  }, [cursor]);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("Copied");
    } catch {
      setCopyState("Copy unavailable. Select the value to copy it manually.");
    }
  };
  const fields = record(log?.fields) ?? {};
  const entityId = text(log?.functionId) || text(log?.serviceId);
  const entity = graph?.nodes.find((node) => node.id === entityId);
  return (
    <div className="log-details">
      <header className="log-detail-heading">
        <strong>Log {text(log?.timestamp)}</strong>
        <div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous log"
            isDisabled={!previous}
            onPress={() => onSelect(previous)}
          >
            <ArrowUp size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next log"
            isDisabled={!next}
            onPress={() => onSelect(next)}
          >
            <ArrowDown size={16} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close log details" onPress={onClose}>
            <X size={16} />
          </Button>
        </div>
      </header>
      {state === "loading" && <p role="status">Loading log…</p>}
      {state === "missing" && (
        <p role="status">This log is no longer retained. It may have expired.</p>
      )}
      {state === "error" && <p role="alert">Log details could not be loaded.</p>}
      {state === "ready" && log && (
        <>
          <pre className="log-message">{text(log.message)}</pre>
          <dl className="log-identities">
            {entityId && (
              <div>
                <dt>Entity</dt>
                <dd>{entityId}</dd>
              </div>
            )}
            {[
              ["Level", text(log.level).toUpperCase()],
              ["Entity type", entity?.kind],
              ["Service", text(log.serviceId)],
              ["Component", text(log.component)],
              ["Source", text(log.origin)],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            {["traceId", "spanId", "requestId", "correlationId", "generationId"].map(
              (key) =>
                text(log[key]) && (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      <code>{text(log[key])}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Copy ${key}`}
                        onPress={() => void copy(text(log[key]))}
                      >
                        <Copy size={14} />
                      </Button>
                    </dd>
                  </div>
                ),
            )}
          </dl>
          <span role="status" className="supporting-copy">
            {copyState}
          </span>
          {fields.error !== undefined && (
            <section aria-label="Structured error">
              <h3>Error</h3>
              <pre className="log-message">{JSON.stringify(fields.error, null, 2)}</pre>
            </section>
          )}
          <details className="log-metadata">
            <summary>Metadata</summary>
            <pre className="log-message">{JSON.stringify(fields, null, 2)}</pre>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void copy(JSON.stringify(log, null, 2))}
            >
              Copy record
            </Button>
          </details>
          <LogTrace traceId={text(log.traceId)} spanId={text(log.spanId)} />
        </>
      )}
    </div>
  );
}
