"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";
import { OverlayDialog } from "../../components/ui/dialog";
import { LoadingRows } from "../../components/blocks/block-state";
import { CopyButton } from "../../components/blocks/copy-button";
import { middleTruncate } from "../../lib/format";
import { logQueryKey } from "../../lib/log-query";
import { traceGroups } from "../../lib/observability-model";
import { useSignalPage } from "../../lib/use-signal-page";
import { LogToolbar } from "../logs/log-toolbar";
import { LogTrace } from "../logs/log-trace";
import { StreamState } from "../logs/stream-state";
import { TraceTable } from "./trace-table";
import { HistoryStatus } from "../history-status";
import "../logs/logs.css";
import "./traces.css";

export function TracesClient() {
  const router = useRouter();
  const search = useSearchParams();
  const params = new URLSearchParams(search.toString());
  params.set("source", "all");
  params.delete("severity");
  const selected = params.get("trace") ?? "";
  const cursor = params.get("cursor") ?? "";
  const [paused, setPaused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [revision, setRevision] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const blocked = paused || scrolled || !!selected || !!cursor;
  const page = useSignalPage("traces", logQueryKey(params), blocked, revision);
  const groups = traceGroups(page.items);
  const index = groups.findIndex((group) => group.traceId === selected);
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`/traces?${next}`, { scroll: false });
  };
  const close = () => {
    update({ trace: "" });
    scroll.current
      ?.querySelector<HTMLButtonElement>(`[data-trace-id="${CSS.escape(selected)}"]`)
      ?.focus();
  };
  const resume = () => {
    setPaused(false);
    setScrolled(false);
    update({ cursor: "", trace: "" });
    scroll.current?.scrollTo({ top: 0 });
    setRevision((value) => value + 1);
  };
  const detail = selected && (
    <div className="log-details trace-details">
      <header className="log-detail-heading">
        <div className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
          <strong className="truncate font-normal" title={selected}>
            {middleTruncate(selected, 24)}
          </strong>
          <CopyButton value={selected} label="Copy trace ID" />
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous trace"
            isDisabled={index <= 0}
            onPress={() => update({ trace: groups[index - 1]!.traceId })}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next trace"
            isDisabled={index < 0 || index === groups.length - 1}
            onPress={() => update({ trace: groups[index + 1]!.traceId })}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        </div>
      </header>
      <LogTrace key={selected} traceId={selected} spanId="" />
    </div>
  );
  return (
    <div className="logs-workspace traces-workspace">
      <HistoryStatus value={page.storage} />
      <div className="log-split">
        <section className="log-list-panel" aria-label="Traces">
          <header className="log-panel-header">
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="text-sm font-semibold text-foreground">Traces</h1>
              <StreamState blocked={blocked} live={page.live} />
            </div>
            <span role="status" className="text-[11px] text-muted-foreground tabular-nums">
              {groups.length.toLocaleString()} {groups.length === 1 ? "trace" : "traces"}
              {cursor ? " · older page" : ""}
            </span>
          </header>
          <LogToolbar
            kind="traces"
            params={params}
            paused={blocked}
            onPause={() => (blocked ? resume() : setPaused(true))}
            onChange={(values) => {
              update({ ...values, cursor: "", trace: "" });
              scroll.current?.scrollTo({ top: 0 });
              setScrolled(false);
            }}
          />
          <div className="log-viewport">
            <div
              className="log-scroll neon-scroll-fade"
              ref={scroll}
              onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 8)}
            >
              {page.state === "loading" && <LoadingRows label="Loading traces…" rows={8} />}
              {page.state === "error" && (
                <div className="log-list-state text-danger" role="alert">
                  Traces could not be loaded.{" "}
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => setRevision((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {page.state === "ready" && groups.length === 0 && (
                <div className="log-list-state">
                  <p className="text-[13px] font-medium text-foreground">
                    No retained traces match these filters.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Traces appear as requests, jobs and events run.
                  </p>
                </div>
              )}
              <TraceTable
                groups={groups}
                selected={selected}
                onSelect={(trace) => update({ trace })}
              />
            </div>
            {page.pending && blocked ? (
              <Button className="log-new" variant="secondary" size="sm" onPress={resume}>
                <ArrowUp aria-hidden="true" />
                New traces available
              </Button>
            ) : null}
          </div>
          <footer className="log-pagination">
            <Button variant="ghost" size="sm" isDisabled={!cursor} onPress={resume}>
              <ChevronLeft aria-hidden="true" />
              Newest
            </Button>
            <span>100 traces per page</span>
            <Button
              variant="ghost"
              size="sm"
              isDisabled={!page.nextCursor || page.state === "loading"}
              onPress={() => {
                update({ cursor: page.nextCursor!, trace: "" });
                scroll.current?.scrollTo({ top: 0 });
              }}
            >
              Older
              <ChevronRight aria-hidden="true" />
            </Button>
          </footer>
        </section>
      </div>
      <OverlayDialog
        placement="right"
        title="Trace details"
        isOpen={!!selected}
        onOpenChange={(open) => !open && close()}
        trigger={<Button style={{ display: "none" }}>Inspect trace</Button>}
      >
        {detail}
      </OverlayDialog>
    </div>
  );
}
