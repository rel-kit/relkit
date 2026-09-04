"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "../../components/ui/button";
import { OverlayDialog } from "../../components/ui/dialog";
import { logQueryKey } from "../../lib/log-query";
import { traceGroups } from "../../lib/observability-model";
import { useSignalPage } from "../../lib/use-signal-page";
import { LogToolbar } from "../logs/log-toolbar";
import { LogTrace } from "../logs/log-trace";
import { TraceTable } from "./trace-table";
import "../logs/logs.css";

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
        <strong>Trace {selected}</strong>
        <div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous trace"
            isDisabled={index <= 0}
            onPress={() => update({ trace: groups[index - 1]!.traceId })}
          >
            <ArrowUp size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next trace"
            isDisabled={index < 0 || index === groups.length - 1}
            onPress={() => update({ trace: groups[index + 1]!.traceId })}
          >
            <ArrowDown size={16} />
          </Button>
        </div>
      </header>
      <LogTrace key={selected} traceId={selected} spanId="" />
    </div>
  );
  return (
    <div className="logs-workspace traces-workspace">
      <header className="logs-heading">
        <h1>Traces</h1>
        <span role="status">
          {blocked ? "Paused" : page.live} · {groups.length} traces
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
      <div className="log-split">
        <section className="log-list-panel" aria-label="Traces">
          <div
            className="log-scroll"
            ref={scroll}
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 8)}
          >
            {page.state === "loading" && (
              <p className="log-list-state" role="status">
                Loading traces…
              </p>
            )}
            {page.state === "error" && (
              <p className="log-list-state" role="alert">
                Traces could not be loaded.{" "}
                <Button variant="ghost" onPress={() => setRevision((value) => value + 1)}>
                  Retry
                </Button>
              </p>
            )}
            {page.state === "ready" && groups.length === 0 && (
              <p className="log-list-state">No retained traces match these filters.</p>
            )}
            <TraceTable
              groups={groups}
              selected={selected}
              onSelect={(trace) => update({ trace })}
            />
          </div>
          <footer className="log-pagination">
            <Button variant="ghost" size="sm" isDisabled={!cursor} onPress={resume}>
              Newest
            </Button>
            {page.pending && blocked ? (
              <Button variant="secondary" size="sm" onPress={resume}>
                New traces available
              </Button>
            ) : (
              <span>100 traces per page</span>
            )}
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
