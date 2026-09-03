"use client";

import { useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, TriangleAlert } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { OverlayDialog } from "../components/ui/dialog";
import { Field } from "../components/ui/field";
import { SelectField } from "../components/ui/select";
import { ContentTabs } from "../components/ui/tabs";
import type { InspectorObject } from "../lib/api-types";
import { waterfall, type WaterfallSpan } from "../lib/observability-model";
import { TraceWaterfallRows } from "./trace-waterfall-rows";

const zooms = [
  { id: "1", label: "100%" },
  { id: "1.5", label: "150%" },
  { id: "2", label: "200%" },
  { id: "3", label: "300%" },
] as const;

export function TraceWaterfall({
  spans,
  requests,
  compact = false,
  highlightedSpanId,
}: {
  readonly spans: readonly InspectorObject[];
  readonly requests?: readonly InspectorObject[];
  readonly compact?: boolean;
  readonly highlightedSpanId?: string;
}) {
  const items = useMemo(() => waterfall(spans, requests), [spans, requests]);
  const [query, setQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [zoom, setZoom] = useState("1");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<WaterfallSpan>();
  const parentIds = useMemo(() => new Set(items.flatMap((item) => item.parentId ?? [])), [items]);
  const visible = useMemo(
    () =>
      items.filter((item) => matches(item, query, errorsOnly) && !hidden(item, items, collapsed)),
    [collapsed, errorsOnly, items, query],
  );
  const toggle = (id: string): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section
      className={`panel trace-panel${compact ? " trace-compact" : ""}`}
      aria-label="Span hierarchy and timing"
    >
      <div className="section-heading">
        <div>
          <h2 id="trace-waterfall-heading">
            {requests?.length ? "Request lifecycle" : "Span hierarchy and timing"}
          </h2>
        </div>
        <Badge>
          {visible.length} of {items.length} {requests?.length ? "steps" : "spans"}
        </Badge>
      </div>
      <Card className="trace-toolbar" aria-label="Trace filters">
        {compact ? (
          <input
            aria-label="Search spans"
            placeholder="Search lifecycle…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : (
          <Field
            label="Search spans"
            value={query}
            onChange={setQuery}
            placeholder="Name, ID, kind, or status"
          />
        )}
        {!compact && (
          <SelectField label="Timeline zoom" items={zooms} value={zoom} onChange={setZoom} />
        )}
        {!compact && (
          <Button
            variant={errorsOnly ? "default" : "secondary"}
            size="sm"
            aria-pressed={errorsOnly}
            onPress={() => setErrorsOnly((value) => !value)}
          >
            <TriangleAlert aria-hidden="true" className="size-3.5" /> Errors only
          </Button>
        )}
        <Button variant="ghost" size="sm" onPress={() => setCollapsed(new Set())}>
          <ChevronsUpDown aria-hidden="true" className="size-3.5" />{" "}
          <span className={compact ? "sr-only" : undefined}>Expand all</span>
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setCollapsed(new Set(parentIds))}>
          <ChevronsDownUp aria-hidden="true" className="size-3.5" />{" "}
          <span className={compact ? "sr-only" : undefined}>Collapse all</span>
        </Button>
      </Card>
      {items.length === 0 ? (
        <p className="supporting-copy">No spans are retained for this trace.</p>
      ) : visible.length === 0 ? (
        <p className="supporting-copy">No spans match the active filters.</p>
      ) : (
        <TraceWaterfallRows
          items={visible}
          parentIds={parentIds}
          collapsed={collapsed}
          zoom={Number(zoom)}
          onToggle={toggle}
          onSelect={setSelected}
          {...(highlightedSpanId ? { highlightedSpanId } : {})}
        />
      )}
      <OverlayDialog
        placement="right"
        title={selected?.name ?? "Span"}
        {...(selected
          ? { description: `${selected.kind} · ${duration(selected.durationMs)}` }
          : {})}
        isOpen={selected !== undefined}
        onOpenChange={(open) => !open && setSelected(undefined)}
        trigger={<Button style={{ display: "none" }}>Inspect span</Button>}
      >
        {selected && <ContentTabs label="Span details" items={detailTabs(selected)} />}
      </OverlayDialog>
    </section>
  );
}

function detailTabs(span: WaterfallSpan) {
  return [
    {
      id: "summary",
      label: "Summary",
      content: (
        <dl className="identity-grid">
          <div>
            <dt>{span.recordType === "span" ? "Span ID" : "Record"}</dt>
            <dd>{span.spanId || `${span.recordType} · ${span.name}`}</dd>
          </div>
          <div>
            <dt>Parent</dt>
            <dd>{span.parentId ?? "Root"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{span.outcome || span.status || "recorded"}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{duration(span.durationMs)}</dd>
          </div>
        </dl>
      ),
    },
    {
      id: "metadata",
      label: "Attributes & logs",
      content: <pre className="safe-json">{JSON.stringify(span.details, null, 2)}</pre>,
    },
  ];
}

function matches(span: WaterfallSpan, query: string, errorsOnly: boolean): boolean {
  if (errorsOnly && !span.error) return false;
  const value = query.trim().toLowerCase();
  return (
    value === "" ||
    `${span.name} ${span.spanId} ${span.kind} ${span.status ?? ""} ${span.outcome ?? ""}`
      .toLowerCase()
      .includes(value)
  );
}

function hidden(
  span: WaterfallSpan,
  items: readonly WaterfallSpan[],
  collapsed: ReadonlySet<string>,
): boolean {
  const parents = new Map(items.map((item) => [item.id, item.parentId]));
  const seen = new Set<string>();
  let parent = span.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    if (collapsed.has(parent)) return true;
    parent = parents.get(parent);
  }
  return false;
}

function duration(value: number | undefined): string {
  return value === undefined ? "duration unavailable" : `${value.toLocaleString("en-US")} ms`;
}
