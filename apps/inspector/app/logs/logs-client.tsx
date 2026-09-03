"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../../components/ui/button";
import { OverlayDialog } from "../../components/ui/dialog";
import { logQueryKey } from "../../lib/log-query";
import { text } from "../../lib/observability-model";
import { useSignalPage } from "../../lib/use-signal-page";
import { useInspectorGraph } from "../../lib/use-graph";
import { LogToolbar } from "./log-toolbar";
import { LogTable } from "./log-table";
import { LogDetails } from "./log-details";
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
      <header className="logs-heading">
        <h1>Logs</h1>
        <span role="status">
          {blocked ? "Paused" : logs.live} · {logs.items.length} logs
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
      {logs.storage?.state === "degraded" && (
        <p role="alert" className="log-storage-warning">
          Storage degraded. {String(logs.storage.failed ?? 0)} failed;{" "}
          {String(logs.storage.dropped ?? 0)} dropped records. Restart dev to recover.
        </p>
      )}
      {logs.storage?.state === "unavailable" && (
        <p className="supporting-copy" role="status">
          Storage status unavailable.
        </p>
      )}
      <div className="log-split" data-selected={!!selected}>
        <section className="log-list-panel" aria-label="Logs">
          <div
            className="log-scroll"
            ref={scroll}
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 8)}
          >
            {logs.state === "loading" && (
              <p className="log-list-state" role="status">
                Loading logs…
              </p>
            )}
            {logs.state === "error" && (
              <p className="log-list-state" role="alert">
                Logs could not be loaded.{" "}
                <Button variant="ghost" onPress={() => setRevision((value) => value + 1)}>
                  Retry
                </Button>
              </p>
            )}
            {logs.state === "ready" && logs.items.length === 0 && (
              <p className="log-list-state">No retained logs match these filters.</p>
            )}
            <LogTable items={logs.items} selected={selected} onSelect={(log) => update({ log })} />
          </div>
          <footer className="log-pagination">
            <Button variant="ghost" size="sm" isDisabled={!cursor} onPress={resume}>
              Newest
            </Button>
            {logs.pending && blocked ? (
              <Button className="log-new" variant="secondary" size="sm" onPress={resume}>
                New logs available
              </Button>
            ) : (
              <span>50 per page</span>
            )}
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
