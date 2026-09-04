"use client";

import { useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, TriangleAlert } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { OverlayDialog } from "../components/ui/dialog";
import { Field } from "../components/ui/field";
import { ContentTabs } from "../components/ui/tabs";
import type { InspectorObject } from "../lib/api-types";
import { waterfall, type WaterfallSpan } from "../lib/observability-model";
import { visibleTraceStepCount } from "../lib/trace-timeline";
import { TraceWaterfallRows } from "./trace-waterfall-rows";
import { detailTabs, duration } from "./trace-waterfall-detail";

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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string>();
  const selected = items.find((item) => item.id === selectedId);
  const parentIds = useMemo(() => new Set(items.flatMap((item) => item.parentId ?? [])), [items]);
  const visible = useMemo(
    () =>
      items.filter((item) => matches(item, query, errorsOnly) && !hidden(item, items, collapsed)),
    [collapsed, errorsOnly, items, query],
  );
  const visibleSteps = visibleTraceStepCount(visible, collapsed);
  const totalSteps = visibleTraceStepCount(items);
  return (
    <section
      className={`panel trace-panel${compact ? " trace-compact" : ""}`}
      aria-label="Ordered trace timeline"
    >
      <div className="section-heading">
        <div>
          <h2 id="trace-waterfall-heading">
            {requests?.length ? "Request timeline" : "Trace timeline"}
          </h2>
          <p className="supporting-copy">
            Numbered by recorded time. Events branch from operations.
          </p>
        </div>
        <Badge>
          {visibleSteps} of {totalSteps} steps
        </Badge>
      </div>
      <Card className="trace-toolbar" aria-label="Trace filters">
        {compact ? (
          <input
            aria-label="Search steps"
            placeholder="Search lifecycle…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : (
          <Field
            label="Search steps"
            value={query}
            onChange={setQuery}
            placeholder="Step, event, ID, kind, or status"
          />
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
        <p className="supporting-copy">No steps are retained for this trace.</p>
      ) : visible.length === 0 ? (
        <p className="supporting-copy">No steps match the active filters.</p>
      ) : (
        <TraceWaterfallRows
          items={visible}
          collapsed={collapsed}
          onSelect={(span) => setSelectedId(span.id)}
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
        onOpenChange={(open) => !open && setSelectedId(undefined)}
        trigger={<Button style={{ display: "none" }}>Inspect span</Button>}
      >
        {selected && <ContentTabs label="Span details" items={detailTabs(selected)} />}
      </OverlayDialog>
    </section>
  );
}

function matches(span: WaterfallSpan, query: string, errorsOnly: boolean): boolean {
  if (errorsOnly && !span.error) return false;
  const value = query.trim().toLowerCase();
  return (
    value === "" ||
    `${span.name} ${span.spanId} ${span.kind} ${span.status ?? ""} ${span.outcome ?? ""} ${span.events.map((event) => event.name).join(" ")}`
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
