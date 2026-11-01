"use client";

import type { InspectorObject } from "../../lib/api-types";
import { text } from "../../lib/observability-model";
import { cn } from "../../lib/utils";
import { AnsiText, stripAnsi } from "./ansi-text";
import { fieldsPreview, levelClass, logClock, logEntity } from "./log-format";

/*
 * Dense mono log rows in the Neon LogsViewer style, kept as a real table so each line stays a
 * row with named columns. The message cell holds the row's one focusable control.
 */
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
      <thead>
        <tr>
          <th scope="col" className="log-col-time">
            Time
          </th>
          <th scope="col" className="log-col-level">
            Level
          </th>
          <th scope="col" className="log-col-entity">
            Entity
          </th>
          <th scope="col">Message</th>
          <th scope="col" className="log-col-fields">
            Fields
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => {
          const cursor = text(item.cursor);
          const timestamp = text(item.timestamp);
          const clock = logClock(timestamp);
          const level = text(item.level);
          const message = text(item.message);
          const plain = stripAnsi(message);
          const entity = logEntity(item);
          const fields = fieldsPreview(item);
          const isSelected = selected === cursor;
          return (
            <tr
              key={cursor}
              data-selected={isSelected}
              data-level={level}
              onClick={() => onSelect(cursor)}
            >
              <td className="log-col-time" title={timestamp || undefined}>
                {clock.day ? <span className="log-day">{clock.day} </span> : null}
                {clock.time}
              </td>
              <td className="log-col-level">
                <span className={cn("log-severity", levelClass(level))} data-level={level}>
                  {level.toUpperCase() || "—"}
                </span>
              </td>
              <td className="log-col-entity" title={entity || undefined}>
                {entity || "—"}
              </td>
              <td className="log-col-message">
                <button
                  type="button"
                  data-log-cursor={cursor}
                  aria-pressed={isSelected}
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
                  title={plain}
                >
                  {message ? <AnsiText value={message} /> : "(empty message)"}
                </button>
              </td>
              <td className="log-col-fields" title={fields || undefined}>
                {fields}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
