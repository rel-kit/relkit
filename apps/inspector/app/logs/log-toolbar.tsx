"use client";

/*
 * Controls row adapted from Neon UI LogsViewer (https://ui.neon.com/database/logs-viewer), MIT.
 * See public/THIRD_PARTY_NOTICES.txt. Every control writes URL state; the backend filters.
 */
import { useState } from "react";
import { Check, ChevronDown, Clock, Filter, Pause, Play, Search, X } from "lucide-react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { LOG_LEVELS, levelClass } from "./log-format";

const RANGES = [
  { id: "15m", label: "Last 15 minutes", short: "15m" },
  { id: "1h", label: "Last hour", short: "1h" },
  { id: "24h", label: "Last 24 hours", short: "24h" },
  { id: "7d", label: "Last 7 days", short: "7d" },
  { id: "custom", label: "Custom range", short: "Custom" },
] as const;

const ID_FILTERS = [
  ["serviceId", "Service"],
  ["functionId", "Function"],
  ["requestId", "Request ID"],
  ["traceId", "Trace ID"],
] as const;

const control =
  "h-8 rounded-md border border-input bg-background text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

export function LogToolbar({
  params,
  paused,
  onChange,
  onPause,
  kind = "logs",
}: {
  readonly params: URLSearchParams;
  readonly paused: boolean;
  readonly onChange: (values: Record<string, string>) => void;
  readonly onPause: () => void;
  readonly kind?: "logs" | "traces";
}) {
  const severity = params.get("severity") ?? "";
  const range = params.get("range") ?? "24h";
  return (
    <div className="log-toolbar">
      <div className="log-controls">
        <SearchForm
          key={params.get("search") ?? ""}
          kind={kind}
          params={params}
          onChange={onChange}
        />
        {kind === "logs" && (
          <fieldset className="log-levels">
            <legend className="sr-only">Log level</legend>
            {[
              { value: "", label: "All" },
              ...LOG_LEVELS,
              ...(severity && !LOG_LEVELS.some((level) => level.value === severity)
                ? [{ value: severity, label: severity[0]!.toUpperCase() + severity.slice(1) }]
                : []),
            ].map((level) => {
              const active = severity === level.value;
              return (
                <button
                  key={level.value || "all"}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "h-6 rounded-sm px-2 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? cn("bg-muted", level.value ? levelClass(level.value) : "text-foreground")
                      : "text-muted-foreground/80 hover:text-foreground",
                  )}
                  onClick={() => onChange({ severity: active ? "" : level.value })}
                >
                  {level.label}
                </button>
              );
            })}
          </fieldset>
        )}
        <Select
          aria-label="Time range"
          className="shrink-0"
          selectedKey={range}
          onSelectionChange={(key) => onChange({ range: String(key) })}
        >
          <AriaButton className={cn(control, "flex items-center gap-2 px-2.5")}>
            <Clock aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <SelectValue className="font-medium tabular-nums">
              {RANGES.find((item) => item.id === range)?.short ?? "24h"}
            </SelectValue>
            <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
          </AriaButton>
          <Popover className="z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-[var(--shadow)]">
            <ListBox items={RANGES} className="outline-none">
              {(item) => (
                <ListBoxItem
                  id={item.id}
                  textValue={item.label}
                  className="group flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-muted focus:bg-muted"
                >
                  <Check
                    aria-hidden="true"
                    className="size-3.5 opacity-0 group-data-[selected]:opacity-100"
                  />
                  {item.label}
                </ListBoxItem>
              )}
            </ListBox>
          </Popover>
        </Select>
        <FilterPopover kind={kind} params={params} onChange={onChange} />
        <Button
          variant="secondary"
          size="sm"
          className="h-8"
          aria-pressed={paused}
          onPress={onPause}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {paused ? "Resume" : "Live"}
        </Button>
      </div>
      {range === "custom" && (
        <form
          className="log-custom-range"
          onSubmit={(event) => {
            event.preventDefault();
            onChange(
              Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
            );
          }}
        >
          <label>
            From
            <input
              required
              type="datetime-local"
              name="from"
              className={cn(control, "px-2")}
              defaultValue={params.get("from") ?? ""}
            />
          </label>
          <label>
            To
            <input
              required
              type="datetime-local"
              name="to"
              className={cn(control, "px-2")}
              defaultValue={params.get("to") ?? ""}
            />
          </label>
          <Button type="submit" size="sm" className="h-8">
            Apply range
          </Button>
        </form>
      )}
    </div>
  );
}

function SearchForm({
  kind,
  params,
  onChange,
}: {
  readonly kind: "logs" | "traces";
  readonly params: URLSearchParams;
  readonly onChange: (values: Record<string, string>) => void;
}) {
  const current = params.get("search") ?? "";
  const [draft, setDraft] = useState(current);
  return (
    <form
      className="log-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onChange({ search: draft.trim() });
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          name="search"
          aria-label={`Search ${kind}`}
          placeholder={
            kind === "logs" ? "Search messages, IDs, metadata…" : "Search names, IDs, metadata…"
          }
          maxLength={512}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={cn(control, "w-full pr-8 pl-8 placeholder:text-muted-foreground/70")}
        />
        {draft ? (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => {
              setDraft("");
              if (current) onChange({ search: "" });
            }}
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        ) : null}
      </div>
      <Button type="submit" variant="secondary" size="sm" className="h-8">
        Search
      </Button>
    </form>
  );
}

function FilterPopover({
  kind,
  params,
  onChange,
}: {
  readonly kind: "logs" | "traces";
  readonly params: URLSearchParams;
  readonly onChange: (values: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const source = params.get("source") ?? "application";
  const active =
    ID_FILTERS.filter(([key]) => params.get(key)).length +
    (kind === "logs" && source !== "application" ? 1 : 0);
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" className="h-8">
        <Filter aria-hidden="true" />
        Filter
        {active > 0 ? (
          <span className="rounded-sm bg-muted px-1 font-mono text-[10px] tabular-nums text-foreground">
            {active}
          </span>
        ) : null}
      </Button>
      <Popover
        placement="bottom end"
        className="z-50 w-[min(320px,90vw)] rounded-lg border border-border bg-popover shadow-[var(--shadow)] outline-none"
      >
        <Dialog
          aria-label={kind === "logs" ? "Log filters" : "Trace filters"}
          className="outline-none"
        >
          <form
            className="grid gap-3 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              onChange(
                Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
              );
              setOpen(false);
            }}
          >
            {kind === "logs" && (
              <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                Source
                <select name="source" defaultValue={source} className={cn(control, "px-2")}>
                  <option value="application">Application / runtime</option>
                  <option value="relkit">RelKit lifecycle</option>
                  <option value="inspector">Inspector process</option>
                  <option value="all">All sources</option>
                </select>
              </label>
            )}
            {ID_FILTERS.map(([key, label]) => (
              <label key={key} className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                {label}
                <input
                  name={key}
                  defaultValue={params.get(key) ?? ""}
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(control, "px-2 font-mono")}
                />
              </label>
            ))}
            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  onChange({
                    ...(kind === "logs" ? { source: "" } : {}),
                    ...Object.fromEntries(ID_FILTERS.map(([key]) => [key, ""])),
                  });
                  setOpen(false);
                }}
              >
                Clear
              </Button>
              <Button type="submit" size="sm">
                Apply filters
              </Button>
            </div>
          </form>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
