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

export function TraceWaterfall({ spans }: { readonly spans: readonly InspectorObject[] }) {
  const items = useMemo(() => waterfall(spans), [spans]);
  const [query, setQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [zoom, setZoom] = useState("1");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<WaterfallSpan>();
  const parentIds = useMemo(
    () => new Set(items.flatMap((item) => item.parentSpanId ?? [])),
    [items],
  );
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
    <section className="panel trace-panel" aria-labelledby="trace-waterfall-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TRACE WATERFALL</p>
          <h2 id="trace-waterfall-heading">Span hierarchy and timing</h2>
        </div>
        <Badge>
          {visible.length} of {items.length} spans
        </Badge>
      </div>
      <Card className="trace-toolbar" aria-label="Trace filters">
        <Field
          label="Search spans"
          value={query}
          onChange={setQuery}
          placeholder="Name, ID, kind, or status"
        />
        <SelectField label="Timeline zoom" items={zooms} value={zoom} onChange={setZoom} />
        <Button
          variant={errorsOnly ? "default" : "secondary"}
          size="sm"
          aria-pressed={errorsOnly}
          onPress={() => setErrorsOnly((value) => !value)}
        >
          <TriangleAlert aria-hidden="true" className="size-3.5" /> Errors only
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setCollapsed(new Set())}>
          <ChevronsUpDown aria-hidden="true" className="size-3.5" /> Expand all
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setCollapsed(new Set(parentIds))}>
          <ChevronsDownUp aria-hidden="true" className="size-3.5" /> Collapse all
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
        trigger={
          <Button className="sr-only" tabIndex={-1}>
            Inspect span
          </Button>
        }
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
            <dt>Span ID</dt>
            <dd>{span.spanId}</dd>
          </div>
          <div>
            <dt>Parent</dt>
            <dd>{span.parentSpanId ?? "Root"}</dd>
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
  const parents = new Map(items.map((item) => [item.spanId, item.parentSpanId]));
  let parent = span.parentSpanId;
  while (parent) {
    if (collapsed.has(parent)) return true;
    parent = parents.get(parent);
  }
  return false;
}

function duration(value: number | undefined): string {
  return value === undefined ? "duration unavailable" : `${value.toLocaleString("en-US")} ms`;
}
