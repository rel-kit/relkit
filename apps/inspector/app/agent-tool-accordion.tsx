"use client";

/*
 * Tool call chip in the style of Neon UI ToolCallChip (MIT, see public/THIRD_PARTY_NOTICES.txt):
 * a status dot, the tool name in mono and its duration; it discloses input, progress and output.
 */
import { ChevronRight } from "lucide-react";
import { Button, Disclosure, DisclosurePanel } from "react-aria-components";
import { CodeBlock } from "../components/blocks/code-block";
import type { StatusTone } from "../components/neon/status-badge";
import { formatDuration } from "../lib/format";
import { cn } from "../lib/utils";
import type { AgentClientEvent, BrowserMessagePart } from "./application-runtime-types";

type ToolPart = Extract<BrowserMessagePart, { readonly kind: "tool" }>;
type ProgressPart = Extract<BrowserMessagePart, { readonly kind: "progress" }>;

const DOT: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground/50",
  live: "neon-status-breathe bg-live text-live",
};

export function AgentToolAccordion({
  tool,
  progress,
  events,
}: {
  readonly tool: ToolPart;
  readonly progress: readonly ProgressPart[];
  readonly events: readonly AgentClientEvent[];
}) {
  const toolEvents = events.filter(
    (event) => "toolCallId" in event && event.toolCallId === tool.toolCallId,
  );
  const latestProgress = progress.at(-1)?.value;
  const status = toolStatus(tool.state, latestProgress !== undefined);
  const active =
    tool.state === "started" || tool.state === "input-streaming" || tool.state === "running";
  const durationMs = duration(toolEvents);
  return (
    <Disclosure
      className="group/tool w-full max-w-xl min-w-0 overflow-hidden rounded-md border border-border bg-card data-[expanded]:bg-muted/20"
      data-active={active || undefined}
      data-state={tool.state}
    >
      <Button
        slot="trigger"
        className="flex h-8 w-full min-w-0 cursor-default items-center gap-2 px-2.5 text-left outline-none hover:bg-muted/40 data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/50 data-[focus-visible]:ring-inset"
      >
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-[1px]", DOT[toolTone(tool.state)])}
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">{status}</span>
        <code className="min-w-0 shrink truncate font-mono text-xs font-medium text-foreground">
          {tool.toolId}
        </code>
        <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground/80 sm:inline">
          {toolDescription(tool, latestProgress)}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {durationMs === undefined ? "" : formatDuration(durationMs)}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[expanded]/tool:rotate-90 motion-reduce:transition-none"
        />
      </Button>
      <DisclosurePanel className="border-t border-border/70">
        <div className="grid gap-2.5 p-2.5">
          <Detail title="Input" value={tool.input ?? tool.inputText} empty="Not available yet" />
          <Detail title="Progress" value={progress.map((item) => item.value)} empty="No progress" />
          <Detail title="Output" value={tool.output} empty="Pending" />
          <div className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[10.5px]">
            <span className="text-muted-foreground">toolCallId</span>
            <span className="m-0 truncate">{tool.toolCallId}</span>
            <span className="text-muted-foreground">partId</span>
            <span className="m-0 truncate">{tool.partId}</span>
          </div>
          {toolEvents.length === 0 ? null : (
            <ol className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Tool events">
              {toolEvents.map((event) => (
                <li
                  key={event.eventId}
                  className="rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px] text-muted-foreground"
                >
                  {event.kind} <span className="opacity-70">{clock(event.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DisclosurePanel>
    </Disclosure>
  );
}

function Detail({ title, value, empty }: { title: string; value: unknown; empty: string }) {
  const unavailable = value === undefined || (Array.isArray(value) && value.length === 0);
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </span>
      {unavailable ? (
        <span className="text-[11px] text-muted-foreground/80">{empty}</span>
      ) : (
        <CodeBlock value={value} label={`${title.toLowerCase()}`} maxHeight="12rem" />
      )}
    </div>
  );
}

function toolTone(state: ToolPart["state"]): StatusTone {
  if (state === "failed" || state === "denied") return "danger";
  if (state === "approval-required") return "warning";
  if (state === "succeeded") return "success";
  if (state === "input-ready") return "info";
  return "live";
}

function toolStatus(state: ToolPart["state"], hasProgress: boolean): string {
  if (state === "running" && hasProgress) return "Progressing";
  return {
    started: "Starting",
    "input-streaming": "Preparing",
    "input-ready": "Prepared",
    "approval-required": "Waiting to run",
    running: "Running",
    succeeded: "Ran",
    failed: "Failed",
    denied: "Denied",
  }[state];
}

function toolDescription(tool: ToolPart, progress: unknown): string {
  if (tool.state === "running" && progress !== undefined)
    return `Progress · ${shortValue(progress)}`;
  if (tool.state === "input-streaming") return `Input · ${shortValue(tool.inputText)}`;
  if (tool.state === "input-ready") return "Input validated";
  if (tool.state === "approval-required") return "Input ready · Waiting for approval";
  if (tool.state === "succeeded") return "Output ready";
  if (tool.state === "failed") return "Execution failed";
  if (tool.state === "denied") return "Approval denied";
  return tool.state === "running" ? "Executing tool" : "Preparing tool call";
}

function shortValue(value: unknown): string {
  if (value && typeof value === "object" && "stage" in value) return String(value.stage);
  const result = typeof value === "string" ? value : JSON.stringify(value);
  return result === undefined
    ? "Update received"
    : `${result.slice(0, 64)}${result.length > 64 ? "…" : ""}`;
}

function duration(events: readonly AgentClientEvent[]): number | undefined {
  if (events.length < 2) return undefined;
  const milliseconds = Date.parse(events.at(-1)!.createdAt) - Date.parse(events[0]!.createdAt);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function clock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleTimeString([], { timeStyle: "medium" });
}
