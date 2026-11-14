import type { InspectorObject } from "../../lib/api-types";
import { CodeBlock } from "../../components/blocks/code-block";
import type { StatusTone } from "../../components/neon/status-badge";
import { clockTime } from "../../lib/format";
import { cn } from "../../lib/utils";

export interface ChannelFrame extends InspectorObject {
  readonly kind?: string;
  readonly checkpoint?: unknown;
  readonly presence?: unknown;
}
export interface ObservedChannelFrame {
  readonly id: number;
  readonly frame: ChannelFrame;
  readonly receivedAt: string;
}

/** The last frames a channel delivered, each opening to its full payload. */
export function ChannelFrameList({
  frames,
  connection,
}: {
  readonly frames: readonly ObservedChannelFrame[];
  readonly connection: string;
}) {
  return (
    <>
      <div className="flex h-8 items-center justify-between border-b border-border bg-muted/30 px-4 text-[11px] text-muted-foreground">
        <span className="font-medium tracking-wide uppercase">Frames</span>
        <span className="font-mono tabular-nums">{frames.length} / 50</span>
      </div>
      <ul
        className="neon-scroll-fade m-0 max-h-[28rem] min-h-24 list-none overflow-y-auto bg-background p-0 font-mono text-[11px] leading-5"
        aria-label="Channel frames"
      >
        {frames.length === 0 ? (
          <li className="px-4 py-6 text-center text-muted-foreground">
            {connection === "live" || connection === "connecting"
              ? "Waiting for frames…"
              : "Connect to stream frames from this channel."}
          </li>
        ) : null}
        {frames.map(({ id, frame, receivedAt }) => (
          <li className="border-b border-border/40 last:border-b-0" key={id}>
            <details className="group/frame">
              <summary className="grid cursor-default list-none grid-cols-[5.5rem_6.5rem_minmax(0,1fr)] gap-2 px-4 py-1 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <time className="text-muted-foreground/70 tabular-nums" dateTime={receivedAt}>
                  {clockTime(receivedAt)}
                </time>
                <strong className={cn("truncate font-medium", frameColour(frame.kind))}>
                  {frame.kind ?? "frame"}
                </strong>
                <span className="min-w-0 truncate text-foreground/85">{preview(frame)}</span>
              </summary>
              <div className="px-4 pb-2">
                <CodeBlock value={frame} label="frame" maxHeight="16rem" />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

export function connectionTone(value: string): StatusTone {
  switch (value) {
    case "live":
      return "live";
    case "connecting":
    case "loading":
      return "info";
    case "caught-up":
      return "success";
    case "gap":
      return "warning";
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

function frameColour(kind: string | undefined): string {
  if (kind === "gap") return "text-warning";
  if (kind === "caught-up") return "text-success";
  if (kind === "error") return "text-danger";
  return "text-info";
}

function preview(frame: ChannelFrame): string {
  const { kind: _kind, ...rest } = frame;
  try {
    return JSON.stringify(rest);
  } catch {
    return "unavailable";
  }
}
