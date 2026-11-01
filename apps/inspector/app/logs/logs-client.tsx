"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";
import { OverlayDialog } from "../../components/ui/dialog";
import { LoadingRows } from "../../components/blocks/block-state";
import { logQueryKey } from "../../lib/log-query";
import { text } from "../../lib/observability-model";
import { useSignalPage } from "../../lib/use-signal-page";
import { useInspectorGraph } from "../../lib/use-graph";
import { LogToolbar } from "./log-toolbar";
import { LogTable } from "./log-table";
import { LogDetails } from "./log-details";
import { StreamState } from "./stream-state";
import { HistoryStatus } from "../history-status";
import "./logs.css";

export function LogsClient() {
  const router = useRouter();
  const search = useSearchParams();
  const params = new URLSearchParams(search.toString());
  const selected = params.get("log") ?? "";
  const cursor = params.get("cursor") ?? "";
  const [paused, setPaused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [wide, setWide] = useState(false);
  const [revision, setRevision] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const graph = useInspectorGraph();
  const blocked = paused || scrolled || !!selected || !!cursor;
  const logs = useSignalPage("logs", logQueryKey(params), blocked, revision);
  const index = logs.items.findIndex((item) => item.cursor === selected);
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`/logs?${next}`, { scroll: false });
  };
  const close = () => {
    update({ log: "" });
    scroll.current
      ?.querySelector<HTMLButtonElement>(`[data-log-cursor="${CSS.escape(selected)}"]`)
      ?.focus();
  };
  useEffect(() => {
    const query = matchMedia("(min-width: 1200px)");
    const change = () => setWide(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const resume = () => {
    setPaused(false);
    setScrolled(false);
    scroll.current?.scrollTo({ top: 0 });
    update({ log: "", cursor: "" });
    setRevision((value) => value + 1);
  };
  const details = selected && (
    <LogDetails
      key={selected}
      cursor={selected}
      graph={graph.graph}
      previous={index > 0 ? text(logs.items[index - 1]?.cursor) : ""}
      next={index >= 0 ? text(logs.items[index + 1]?.cursor) : ""}
      onSelect={(log) => update({ log })}
      onClose={close}
    />
  );
  return (
    <div
      className="logs-workspace"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected && wide) {
          event.preventDefault();
          close();
        }
      }}
    >
      <HistoryStatus value={logs.storage} />
      <div className="log-split" data-selected={!!selected}>
        <section className="log-list-panel" aria-label="Logs">
          <header className="log-panel-header">
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="text-sm font-semibold text-foreground">Logs</h1>
              <StreamState blocked={blocked} live={logs.live} />
            </div>
            <span role="status" className="text-[11px] text-muted-foreground tabular-nums">
              {logs.items.length.toLocaleString()} {logs.items.length === 1 ? "line" : "lines"}
              {cursor ? " · older page" : ""}
            </span>
          </header>
          <LogToolbar
            params={params}
            paused={blocked}
            onChange={(values) => {
              update({ ...values, cursor: "", log: "" });
              scroll.current?.scrollTo({ top: 0 });
              setScrolled(false);
            }}
            onPause={() => (blocked ? resume() : setPaused(true))}
          />
          <div className="log-viewport">
            <div
              className="log-scroll neon-scroll-fade"
              ref={scroll}
              onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 8)}
            >
              {logs.state === "loading" && <LoadingRows label="Loading logs…" rows={10} />}
              {logs.state === "error" && (
                <div className="log-list-state text-danger" role="alert">
                  Logs could not be loaded.{" "}
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => setRevision((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {logs.state === "ready" && logs.items.length === 0 && (
                <div className="log-list-state">
                  <p className="text-[13px] font-medium text-foreground">
                    No retained logs match these filters.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try a different search, level or time range.
                  </p>
                </div>
              )}
              <LogTable
                items={logs.items}
                selected={selected}
                onSelect={(log) => update({ log })}
              />
            </div>
            {logs.pending && blocked ? (
              <Button className="log-new" variant="secondary" size="sm" onPress={resume}>
                <ArrowUp aria-hidden="true" />
                New logs available
              </Button>
            ) : null}
          </div>
          <footer className="log-pagination">
            <Button variant="ghost" size="sm" isDisabled={!cursor} onPress={resume}>
              <ChevronLeft aria-hidden="true" />
              Newest
            </Button>
            <span>Newest first · 50 per page</span>
            <Button
              variant="ghost"
              size="sm"
              isDisabled={!logs.nextCursor || logs.state === "loading"}
              onPress={() => {
                update({ cursor: logs.nextCursor!, log: "" });
                scroll.current?.scrollTo({ top: 0 });
              }}
            >
              Older
              <ChevronRight aria-hidden="true" />
            </Button>
          </footer>
        </section>
        {wide && selected && (
          <aside className="log-detail-pane" aria-label="Log details">
            {details}
          </aside>
        )}
      </div>
      {!wide && (
        <OverlayDialog
          placement="right"
          title="Log details"
          isOpen={!!selected}
          onOpenChange={(open) => !open && close()}
          trigger={<Button style={{ display: "none" }}>Inspect log</Button>}
        >
          {details}
        </OverlayDialog>
      )}
    </div>
  );
}
