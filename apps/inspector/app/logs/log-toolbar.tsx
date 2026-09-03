"use client";

import { Filter, Pause, Play, Search } from "lucide-react";
import { Button } from "../../components/ui/button";

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
  return (
    <div className="log-toolbar">
      <form
        className="log-search"
        onSubmit={(event) => {
          event.preventDefault();
          onChange({ search: String(new FormData(event.currentTarget).get("search") ?? "") });
        }}
      >
        <Search size={16} aria-hidden="true" />
        <input
          key={params.get("search") ?? ""}
          name="search"
          aria-label={`Search ${kind}`}
          placeholder={
            kind === "logs" ? "Search messages, IDs, metadata…" : "Search names, IDs, metadata…"
          }
          maxLength={512}
          defaultValue={params.get("search") ?? ""}
        />
        <Button type="submit" variant="ghost" size="sm">
          Search
        </Button>
      </form>
      <select
        aria-label="Time range"
        value={params.get("range") ?? "24h"}
        onChange={(event) => onChange({ range: event.target.value })}
      >
        <option value="15m">Last 15 minutes</option>
        <option value="1h">Last hour</option>
        <option value="24h">Last 24 hours</option>
        <option value="7d">Last 7 days</option>
        <option value="custom">Custom range</option>
      </select>
      <details className="log-filters">
        <summary>
          <Filter size={15} aria-hidden="true" /> Filter
        </summary>
        <form
          key={params.toString()}
          onSubmit={(event) => {
            event.preventDefault();
            onChange(
              Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
            );
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}
        >
          {kind === "logs" && (
            <label>
              Level
              <select name="severity" defaultValue={params.get("severity") ?? ""}>
                <option value="">All levels</option>
                {["trace", "debug", "info", "warn", "error", "fatal"].map((level) => (
                  <option key={level} value={level}>
                    {level.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "logs" && (
            <label>
              Source
              <select name="source" defaultValue={params.get("source") ?? "application"}>
                <option value="application">Application / runtime</option>
                <option value="relkit">RelKit lifecycle</option>
                <option value="inspector">Inspector process</option>
                <option value="all">All sources</option>
              </select>
            </label>
          )}
          {[
            ["serviceId", "Service"],
            ["functionId", "Function"],
            ["requestId", "Request ID"],
            ["traceId", "Trace ID"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input name={key} defaultValue={params.get(key!) ?? ""} />
            </label>
          ))}
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </form>
      </details>
      <Button variant="secondary" size="sm" aria-pressed={paused} onPress={onPause}>
        {paused ? <Play size={14} /> : <Pause size={14} />}
        {paused ? "Resume" : "Live"}
      </Button>
      {params.get("range") === "custom" && (
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
              defaultValue={params.get("from") ?? ""}
            />
          </label>
          <label>
            To
            <input required type="datetime-local" name="to" defaultValue={params.get("to") ?? ""} />
          </label>
          <Button type="submit" size="sm">
            Apply range
          </Button>
        </form>
      )}
    </div>
  );
}
