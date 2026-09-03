"use client";

import type { TraceGroup } from "../../lib/observability-model";

export function TraceTable({
  groups,
  selected,
  onSelect,
}: {
  readonly groups: readonly TraceGroup[];
  readonly selected: string;
  readonly onSelect: (traceId: string) => void;
}) {
  return (
    <table className="log-table trace-table">
      <caption className="sr-only">
        Trace results. Use arrow keys to inspect adjacent traces.
      </caption>
      <colgroup>
        <col className="log-date" />
        <col className="log-time" />
        <col />
        <col className="log-time" />
        <col className="log-time" />
      </colgroup>
      <thead>
        <tr>
          {["Date", "Time", "Name", "Outcome", "Duration"].map((name) => (
            <th scope="col" key={name}>
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((group, index) => {
          const date = new Date(group.startedAt ?? "");
          const valid = Number.isFinite(date.getTime());
          return (
            <tr
              key={group.traceId}
              data-selected={selected === group.traceId}
              onClick={() => onSelect(group.traceId)}
            >
              <td>
                {valid
                  ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "—"}
              </td>
              <td className="log-mono">
                {valid
                  ? date.toLocaleTimeString(undefined, {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      fractionalSecondDigits: 3,
                    })
                  : "—"}
              </td>
              <td>
                <button
                  type="button"
                  data-trace-id={group.traceId}
                  title={group.name}
                  aria-pressed={selected === group.traceId}
                  onKeyDown={(event) => {
                    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? groups.length - 1
                          : index + (event.key === "ArrowDown" ? 1 : -1);
                    const id = groups[next]?.traceId;
                    if (!id) return;
                    onSelect(id);
                    event.currentTarget
                      .closest("table")
                      ?.querySelector<HTMLButtonElement>(`[data-trace-id="${CSS.escape(id)}"]`)
                      ?.focus();
                  }}
                >
                  {group.name}
                </button>
              </td>
              <td>{group.outcome || "In progress"}</td>
              <td className="log-mono">
                {group.durationMs === undefined ? "—" : `${group.durationMs.toLocaleString()} ms`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
