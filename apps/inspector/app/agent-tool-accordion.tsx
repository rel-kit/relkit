import { ChevronRight, LoaderCircle, SquareTerminal, X } from "lucide-react";
import type { AgentClientEvent, BrowserMessagePart } from "./application-runtime-types";

type ToolPart = Extract<BrowserMessagePart, { readonly kind: "tool" }>;
type ProgressPart = Extract<BrowserMessagePart, { readonly kind: "progress" }>;

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
  return (
    <details className="agent-tool-accordion" data-active={active || undefined}>
      <summary>
        <StatusIcon state={tool.state} />
        <span className="agent-tool-summary-copy">
          <span className="agent-tool-command">
            {status.label} <strong>{tool.toolId}</strong>
          </span>
          <small>{toolDescription(tool, latestProgress)}</small>
        </span>
        <time>{duration(toolEvents)}</time>
        <ChevronRight aria-hidden="true" className="agent-tool-chevron" />
      </summary>
      <div className="agent-tool-details">
        <Detail title="Input" value={tool.input ?? tool.inputText} empty="Not available yet" />
        <Detail title="Progress" value={progress.map((item) => item.value)} empty="No progress" />
        <Detail title="Output" value={tool.output} empty="Pending" />
        <Detail
          title="IDs"
          value={{ toolCallId: tool.toolCallId, partId: tool.partId }}
          empty="Not available"
        />
        <Detail
          title="Events"
          value={toolEvents.map((event) => ({ kind: event.kind, at: clock(event.createdAt) }))}
          empty="No events"
        />
      </div>
    </details>
  );
}

function Detail({ title, value, empty }: { title: string; value: unknown; empty: string }) {
  const unavailable = value === undefined || (Array.isArray(value) && value.length === 0);
  return (
    <details className="agent-tool-detail">
      <summary>
        <strong>{title}</strong>
        <small>{unavailable ? empty : shortValue(value)}</small>
        <ChevronRight aria-hidden="true" className="agent-tool-detail-chevron" />
      </summary>
      {unavailable ? <p>{empty}</p> : <pre>{format(value)}</pre>}
    </details>
  );
}

function StatusIcon({ state }: { readonly state: ToolPart["state"] }) {
  if (state === "failed" || state === "denied") return <X aria-hidden="true" />;
  if (state === "started" || state === "running" || state === "input-streaming")
    return <LoaderCircle aria-hidden="true" className="agent-tool-spinner" />;
  return <SquareTerminal aria-hidden="true" />;
}

function toolStatus(state: ToolPart["state"], hasProgress: boolean) {
  if (state === "running" && hasProgress) return { label: "Progressing" };
  return {
    label: {
      started: "Starting",
      "input-streaming": "Preparing",
      "input-ready": "Prepared",
      "approval-required": "Waiting to run",
      running: "Running",
      succeeded: "Ran",
      failed: "Failed",
      denied: "Denied",
    }[state],
  };
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

function format(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function duration(events: readonly AgentClientEvent[]): string {
  if (events.length < 2) return "";
  const milliseconds = Date.parse(events.at(-1)!.createdAt) - Date.parse(events[0]!.createdAt);
  return Number.isFinite(milliseconds) ? `${(milliseconds / 1_000).toFixed(1)}s` : "";
}

function clock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleTimeString([], { timeStyle: "medium" });
}
