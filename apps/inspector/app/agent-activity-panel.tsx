import { Activity, Circle, Wrench } from "lucide-react";
import { ContentTabs } from "../components/ui/tabs";
import type { AgentConversationState } from "./agent-observation";
import type { AgentClientEvent, BrowserMessagePart } from "./application-runtime-types";

type ToolPart = Extract<BrowserMessagePart, { readonly kind: "tool" }>;

export function AgentActivityPanel({ state }: { readonly state: AgentConversationState }) {
  const snapshot = state.snapshot;
  const tools = activeTools(state);
  const progress = [...state.events]
    .reverse()
    .find((event) => event.kind === "progress" && event.scope === "run");
  return (
    <aside className="agent-activity" aria-label="Agent activity">
      <div className="agent-activity-summary">
        <dl>
          <div>
            <dt>Current run</dt>
            <dd className="agent-run-status">
              <Activity aria-hidden="true" /> {snapshot?.thread.status ?? "Idle"}
            </dd>
          </div>
          <div>
            <dt>Active tools</dt>
            <dd>{tools.length === 0 ? "None" : `${tools.length} running`}</dd>
          </div>
          <div>
            <dt>Nested executions</dt>
            <dd>{snapshot?.executions.length ?? 0}</dd>
          </div>
        </dl>
        {progress?.kind === "progress" ? (
          <p className="agent-run-progress">{value(progress.value)}</p>
        ) : null}
        {tools.length === 0 ? null : (
          <ul className="agent-active-tools">
            {tools.map((tool) => (
              <li key={tool.toolCallId}>
                <Wrench aria-hidden="true" />
                <span>{tool.toolId}</span>
                <small>{tool.state === "running" ? "Executing" : label(tool.state)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ContentTabs
        label="Agent diagnostics"
        items={[
          { id: "events", label: "Events", content: <Events events={state.events} /> },
          {
            id: "executions",
            label: "Executions",
            content: <Executions value={snapshot?.executions ?? []} />,
          },
          { id: "state", label: "Raw state", content: <Raw value={snapshot} /> },
          { id: "ids", label: "IDs", content: <Ids state={state} /> },
        ]}
      />
    </aside>
  );
}

function Executions({
  value: executions,
}: {
  readonly value: NonNullable<AgentConversationState["snapshot"]>["executions"];
}) {
  if (executions.length === 0) return <p className="agent-activity-empty">No nested executions.</p>;
  return (
    <ul className="agent-event-list">
      {executions.map((execution) => (
        <li key={execution.scope.join("/")}>
          <Circle aria-hidden="true" />
          <div>
            <strong>{execution.agent ?? execution.node ?? execution.scope.join(" / ")}</strong>
            <small>{execution.status}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Events({ events }: { readonly events: readonly AgentClientEvent[] }) {
  if (events.length === 0) return <p className="agent-activity-empty">No live events yet.</p>;
  return (
    <ol className="agent-event-list">
      {events
        .slice(-30)
        .reverse()
        .map((event) => (
          <li key={event.eventId}>
            <Circle aria-hidden="true" />
            <div>
              <strong>{event.kind}</strong>
              <time>{clock(event.createdAt)}</time>
              {"toolCallId" in event ? <code>{event.toolCallId}</code> : null}
            </div>
          </li>
        ))}
    </ol>
  );
}

function Raw({ value: raw }: { readonly value: unknown }) {
  return <pre className="agent-raw-state">{JSON.stringify(raw ?? {}, null, 2)}</pre>;
}

function Ids({ state }: { readonly state: AgentConversationState }) {
  const snapshot = state.snapshot;
  return (
    <dl className="agent-id-list">
      <dt>Thread</dt>
      <dd>{snapshot?.thread.threadId ?? "—"}</dd>
      <dt>Run</dt>
      <dd>{snapshot?.activeRun?.runId ?? snapshot?.currentRuns.at(-1)?.runId ?? "—"}</dd>
      <dt>Checkpoint</dt>
      <dd>{snapshot?.checkpoint.sequence ?? "—"}</dd>
      <dt>Provider epoch</dt>
      <dd>{snapshot?.providerEpoch ?? "—"}</dd>
    </dl>
  );
}

function activeTools(state: AgentConversationState): readonly ToolPart[] {
  return state.messages.flatMap((message) =>
    message.parts.filter(
      (part): part is ToolPart =>
        part.kind === "tool" && !["succeeded", "failed", "denied"].includes(part.state),
    ),
  );
}

function label(value: string): string {
  return value.replaceAll("-", " ");
}

function value(input: unknown): string {
  if (input && typeof input === "object" && "stage" in input) return String(input.stage);
  return typeof input === "string" ? input : JSON.stringify(input);
}

function clock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
