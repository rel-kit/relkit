"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { CodeBlock } from "../../components/blocks/code-block";
import { CopyButton } from "../../components/blocks/copy-button";
import { DetailList, type DetailItem } from "../../components/blocks/details";
import { LoadingRows } from "../../components/blocks/block-state";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { logDetail } from "../../lib/observability-api";
import { record, text } from "../../lib/observability-model";
import type { GraphSnapshot } from "../../lib/graph-model";
import { cn } from "../../lib/utils";
import { AnsiText } from "./ansi-text";
import { levelClass, logClock } from "./log-format";
import { LogTrace } from "./log-trace";

const CORRELATION_IDS = [
  ["traceId", "Trace ID"],
  ["spanId", "Span ID"],
  ["requestId", "Request ID"],
  ["correlationId", "Correlation ID"],
  ["generationId", "Generation ID"],
] as const;

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
      setCopyState("Record copied.");
    } catch {
      setCopyState("Copy unavailable. Select the value to copy it manually.");
    }
  };
  const fields = record(log?.fields) ?? {};
  const entityId = text(log?.functionId) || text(log?.serviceId);
  const entity = graph?.nodes.find((node) => node.id === entityId);
  const level = text(log?.level);
  const timestamp = text(log?.timestamp);
  const clock = logClock(timestamp);
  const identities: DetailItem[] = [
    ...(entityId ? [{ label: "Entity", value: entityId, mono: true }] : []),
    ...(
      [
        ["Entity type", entity?.kind],
        ["Service", text(log?.serviceId)],
        ["Component", text(log?.component)],
        ["Source", text(log?.origin)],
      ] as const
    )
      .filter(([, value]) => value)
      .map(([label, value]) => ({ label, value, mono: label !== "Entity type" })),
    ...CORRELATION_IDS.flatMap(([key, label]) => {
      const value = text(log?.[key]);
      return value
        ? [
            {
              label,
              mono: true,
              value: (
                <span className="flex min-w-0 items-center gap-1">
                  <code className="min-w-0 break-all">{value}</code>
                  <CopyButton value={value} label={`Copy ${key}`} />
                </span>
              ),
            },
          ]
        : [];
    }),
  ];
  return (
    <div className="log-details">
      <header className="log-detail-heading">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px]">
          {state === "ready" && (
            <span className={cn("font-semibold uppercase", levelClass(level))}>{level || "—"}</span>
          )}
          <strong className="truncate font-normal text-muted-foreground" title={timestamp}>
            {state === "ready" ? `${clock.day ? `${clock.day} ` : ""}${clock.time}` : "Log"}
          </strong>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous log"
            isDisabled={!previous}
            onPress={() => onSelect(previous)}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next log"
            isDisabled={!next}
            onPress={() => onSelect(next)}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close log details" onPress={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>
      {state === "loading" && <LoadingRows label="Loading log…" rows={4} />}
      {state === "missing" && (
        <p className="log-detail-state" role="status">
          This log is no longer retained. It may have expired.
        </p>
      )}
      {state === "error" && (
        <p className="log-detail-state text-danger" role="alert">
          Log details could not be loaded.
        </p>
      )}
      {state === "ready" && log && (
        <div className="grid gap-4 py-4">
          <pre className="log-message">
            <AnsiText value={text(log.message)} />
          </pre>
          <DetailList items={identities} columns={2} />
          {fields.error !== undefined && (
            <section aria-label="Structured error" className="grid gap-2">
              <h3 className="text-[11px] font-medium tracking-wide text-danger uppercase">Error</h3>
              <CodeBlock value={fields.error} label="error" maxHeight="16rem" />
            </section>
          )}
          <section aria-label="Fields" className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Fields
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => void copy(JSON.stringify(log, null, 2))}
              >
                Copy record
              </Button>
            </div>
            <CodeBlock value={fields} label="fields" maxHeight="18rem" />
            <span role="status" className="text-xs text-muted-foreground">
              {copyState}
            </span>
          </section>
          <LogTrace traceId={text(log.traceId)} spanId={text(log.spanId)} />
        </div>
      )}
    </div>
  );
}
