/*
 * ANSI colouring adapted from Neon UI LogsViewer (https://ui.neon.com/database/logs-viewer), MIT.
 * See public/THIRD_PARTY_NOTICES.txt. Escape codes are parsed into text spans; no HTML is ever
 * produced from log content.
 */
import Anser from "anser";
import { useMemo } from "react";
import { cn } from "../../lib/utils";

const ANSI_COLORS: Record<string, string> = {
  "ansi-black": "text-foreground",
  "ansi-red": "text-danger",
  "ansi-green": "text-success",
  "ansi-yellow": "text-warning",
  "ansi-blue": "text-info",
  "ansi-magenta": "text-chart-4",
  "ansi-cyan": "text-info",
  "ansi-white": "text-foreground",
  "ansi-bright-black": "text-muted-foreground",
  "ansi-bright-red": "text-danger",
  "ansi-bright-green": "text-success",
  "ansi-bright-yellow": "text-warning",
  "ansi-bright-blue": "text-info",
  "ansi-bright-magenta": "text-chart-4",
  "ansi-bright-cyan": "text-info",
  "ansi-bright-white": "text-foreground",
};

const ESCAPE = /\u001b\[/;

/** Plain text of a possibly ANSI-coloured line, for titles and accessible names. */
export function stripAnsi(value: string): string {
  return ESCAPE.test(value) ? Anser.ansiToText(value) : value;
}

/** Renders ANSI SGR colours and decorations as token-coloured spans. */
export function AnsiText({ value }: { readonly value: string }) {
  const parts = useMemo(
    () =>
      ESCAPE.test(value)
        ? Anser.ansiToJson(value, { json: true, use_classes: true, remove_empty: true })
        : undefined,
    [value],
  );
  if (parts === undefined) return <>{value}</>;
  return (
    <>
      {parts.map((part, index) => {
        if (!part.content) return null;
        const decorations = part.decorations ?? [];
        return (
          <span
            key={index}
            className={cn(
              part.fg ? ANSI_COLORS[part.fg] : undefined,
              decorations.includes("bold") && "font-semibold",
              decorations.includes("dim") && "opacity-70",
              decorations.includes("italic") && "italic",
              decorations.includes("underline") && "underline",
            )}
          >
            {part.content}
          </span>
        );
      })}
    </>
  );
}
