"use client";

import type { InspectorObject } from "../../lib/api-types";
import { text } from "../../lib/observability-model";

export function LogTable({
  items,
  selected,
  onSelect,
}: {
  readonly items: readonly InspectorObject[];
  readonly selected: string;
  readonly onSelect: (cursor: string) => void;
}) {
  return (
    <table className="log-table">
      <caption className="sr-only">Log results. Use arrow keys to inspect adjacent logs.</caption>
      <colgroup>
        <col className="log-date" />
        <col className="log-time" />
        <col className="log-level" />
        <col className="log-entity" />
        <col />
        <col className="log-data" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Time</th>
          <th scope="col">Level</th>
          <th scope="col">Entity</th>
          <th scope="col">Message</th>
          <th scope="col">Data</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => {
          const cursor = text(item.cursor);
          const date = new Date(text(item.timestamp));
          const valid = Number.isFinite(date.getTime());
          const message = text(item.message);
          return (
            <tr key={cursor} data-selected={selected === cursor} onClick={() => onSelect(cursor)}>
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
                <span className="log-severity" data-level={text(item.level)}>
                  {text(item.level).toUpperCase()}
                </span>
              </td>
              <td title={text(item.functionId) || text(item.component)}>
                {text(item.functionId) || text(item.component) || "—"}
              </td>
              <td className="log-mono">
                <button
                  type="button"
                  data-log-cursor={cursor}
                  aria-pressed={selected === cursor}
                  onKeyDown={(event) => {
                    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? items.length - 1
                          : index + (event.key === "ArrowDown" ? 1 : -1);
                    const id = text(items[next]?.cursor);
                    if (id) {
                      onSelect(id);
                      event.currentTarget
                        .closest("table")
                        ?.querySelector<HTMLButtonElement>(`[data-log-cursor="${CSS.escape(id)}"]`)
                        ?.focus();
                    }
                  }}
                  title={message}
                >
                  {message || "(empty message)"}
                </button>
              </td>
              <td className="log-mono" title={JSON.stringify(item.fields)}>
                {JSON.stringify(item.fields ?? {})}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
