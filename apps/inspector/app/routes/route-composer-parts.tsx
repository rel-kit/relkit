import type { RouteField } from "../../lib/route-composer";
import type { RouteStreamFrame } from "../../lib/route-request";
import type { RouteOutcome } from "../../lib/route-status";
import { SessionNote } from "../session-note";

/** The sentence about the response, then, once, who the request acted as. */
export function RouteResult({
  outcome,
  sessionNote,
}: {
  readonly outcome: RouteOutcome;
  readonly sessionNote: string;
}) {
  return (
    <>
      <p
        id="route-outcome"
        data-tone={outcome.tone}
        className="m-0 max-w-none text-xs leading-5 text-muted-foreground data-[tone=danger]:text-danger data-[tone=success]:text-success"
      >
        {outcome.text}
      </p>
      <SessionNote id="route-session-note" text={sessionNote} />
    </>
  );
}

/** Frames received from a streaming route, newest last. */
export function StreamFrames({
  frames,
}: {
  readonly frames: readonly { readonly id: number; readonly frame: RouteStreamFrame }[];
}) {
  if (frames.length === 0) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex h-8 items-center justify-between border-b border-border px-3 text-[11px] text-muted-foreground">
        <span className="font-medium tracking-wide uppercase">Stream</span>
        <span className="font-mono tabular-nums">{frames.length} frames</span>
      </div>
      <ul
        className="neon-scroll-fade m-0 max-h-80 list-none overflow-y-auto p-0 font-mono text-[11px] leading-5"
        aria-label="Stream frames"
      >
        {frames.map(({ id, frame }) => (
          <li
            className="grid grid-cols-[3rem_6rem_minmax(0,1fr)] gap-2 border-b border-border/50 px-3 py-1 last:border-b-0"
            key={id}
          >
            <span className="text-muted-foreground/70 tabular-nums">#{id + 1}</span>
            <strong className="truncate font-medium text-info">
              {frame.kind === "sse" ? frame.event : frame.kind}
            </strong>
            <span className="min-w-0 break-all whitespace-pre-wrap text-foreground/90">
              {framePreview(frame)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A read-only note for the cookies a route reads: the Inspector cannot send them. */
export function CookieNote({ names }: { readonly names: readonly string[] }) {
  if (names.length === 0) return null;
  return (
    <p id="route-cookie-note" className="m-0 max-w-none text-xs text-muted-foreground">
      This route also reads {names.length === 1 ? "the cookie" : "the cookies"}{" "}
      {names.map((name, index) => (
        <span key={name}>
          {index === 0 ? "" : ", "}
          <code className="font-mono">{name}</code>
        </span>
      ))}
      . A browser does not let a page set a <code className="font-mono">Cookie</code> header and the
      Inspector does not forward cookies, so this request cannot send them.
    </p>
  );
}

const SOURCE_ORDER = ["path", "query", "header", "body", "whole-body", "multipart"];

export function groupFields(
  fields: readonly RouteField[],
): readonly { source: string; fields: readonly RouteField[] }[] {
  const groups = new Map<string, RouteField[]>();
  for (const field of fields) {
    const list = groups.get(field.source) ?? [];
    list.push(field);
    groups.set(field.source, list);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => rank(left) - rank(right))
    .map(([source, list]) => ({ source, fields: list }));
}

function rank(source: string): number {
  const index = SOURCE_ORDER.indexOf(source);
  return index === -1 ? SOURCE_ORDER.length : index;
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "path":
      return "Path params";
    case "query":
      return "Query";
    case "header":
      return "Headers";
    case "body":
      return "Body";
    case "whole-body":
      return "Raw body";
    case "multipart":
      return "Multipart";
    default:
      return source;
  }
}

function framePreview(frame: RouteStreamFrame): string {
  if (frame.kind === "text") return frame.value;
  if (frame.kind === "bytes") return `${frame.byteLength} bytes`;
  try {
    return typeof frame.data === "string" ? frame.data : JSON.stringify(frame.data);
  } catch {
    return "unavailable";
  }
}

export function defaults(fields: readonly RouteField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      field.defaultValue === undefined ? [] : [[field.key, field.defaultValue]],
    ),
  );
}
