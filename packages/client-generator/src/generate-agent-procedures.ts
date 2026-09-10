import type { AgentNode, ApplicationGraph } from "@relkit/graph";
import { agentResumeType } from "./generate-agent-resume.js";
import { schemaType } from "./generate-schema.js";

const expectedIdentity =
  'readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity';
const operationId = 'readonly operationId?: import("@relkit/contracts").OperationId';

export function agentProcedureEntries(graph: ApplicationGraph): readonly string[] {
  return entries(
    graph.nodes.filter(
      (node): node is AgentNode => node.kind === "agent" && node.client !== undefined,
    ),
  );
}

export function agentProcedureEntriesFromDocument(value: unknown): readonly string[] {
  return entries(
    (Array.isArray(value) ? value : []).filter(
      (agent): agent is AgentSource =>
        isRecord(agent) && typeof agent.id === "string" && agent.input !== undefined,
    ),
  );
}

interface AgentSource {
  readonly id: string;
  readonly input: unknown;
  readonly chat?: unknown;
  readonly controls?: unknown;
  readonly workflow?: unknown;
}

function entries(agents: readonly AgentSource[]): readonly string[] {
  if (agents.length === 0) return [];
  const scoped = (fields: string) =>
    union(agents.map((agent) => `{ readonly agentId: ${JSON.stringify(agent.id)}; ${fields} }`));
  return [
    procedure("relkit.agent.threads", scoped(expectedIdentity), threadList),
    procedure(
      "relkit.agent.load",
      scoped(`readonly threadId: string; ${expectedIdentity}`),
      'import("@relkit/contracts").ThreadSnapshot',
    ),
    procedure(
      "relkit.agent.observe",
      scoped(
        `readonly threadId: string; readonly after: import("@relkit/contracts").JournalCheckpoint; ${expectedIdentity}`,
      ),
      'AsyncIterable<import("@relkit/contracts").AgentObservation>',
    ),
    procedure("relkit.agent.run", union(agents.flatMap(runInputs)), runReceipt),
    procedure("relkit.agent.control", union(agents.flatMap(controlInputs)), controlReceipt),
    procedure("relkit.agent.receipt", scoped(receiptFields), receiptLookup),
    procedure(
      "relkit.agent.history",
      scoped(
        `readonly threadId: string; readonly snapshotId: string; readonly cursor: string; ${expectedIdentity}`,
      ),
      '{ readonly messages: readonly import("@relkit/contracts").BrowserMessage[]; readonly nextCursor?: string }',
    ),
  ];
}

function runInputs(agent: AgentSource): readonly string[] {
  const common = `readonly agentId: ${JSON.stringify(agent.id)}; readonly threadId: string; ${operationId}; readonly requestDigest?: string; ${expectedIdentity}`;
  const input = schemaType(agent.input);
  const initial = `{ ${common}; readonly resume?: false; readonly payload: ${agent.chat === undefined || agent.chat === null ? input : `${input} | string`} }`;
  const resume = agentResumeType(agent.workflow);
  return resume === "never"
    ? [initial]
    : [
        initial,
        `{ ${common}; readonly resume: true; readonly waitingRevision: string; readonly payload: ${resume} }`,
      ];
}

function controlInputs(agent: AgentSource): readonly string[] {
  const controls = Array.isArray(agent.controls) ? agent.controls.filter(isControl) : [];
  return controls.map(
    (kind) =>
      `{ readonly agentId: ${JSON.stringify(agent.id)}; readonly threadId: string; ${operationId}; readonly requestDigest?: string; readonly kind: ${JSON.stringify(kind)}; readonly payload: ${controlPayload(kind)}; ${expectedIdentity} }`,
  );
}

function controlPayload(kind: string): string {
  if (kind === "steer" || kind === "follow-up") return "string";
  if (kind === "stop") return '{ readonly mode?: "graceful" | "immediate" }';
  if (kind === "approve")
    return '{ readonly approvalId: string; readonly decision: "approve" | "deny" }';
  return "unknown";
}

function procedure(name: string, input: string, output: string): string {
  return `  ${JSON.stringify(name)}: oc.input(schema<${input}>()).output(schema<${output}>()),`;
}

function union(values: readonly string[]): string {
  return values.join(" | ") || "never";
}

function isControl(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const threadList = '{ readonly threads: readonly import("@relkit/contracts").ThreadListItem[] }';
const runReceipt =
  '{ readonly operationId: import("@relkit/contracts").OperationId; readonly threadId: string; readonly runId: string; readonly status: "accepted"; readonly duplicate: boolean } | { readonly operationId: import("@relkit/contracts").OperationId; readonly threadId: string; readonly interruptedRunId: string; readonly runId: string; readonly interruptSetDigest: string; readonly waitingRevision?: string; readonly duplicate: boolean }';
const controlReceipt =
  '{ readonly operationId: import("@relkit/contracts").OperationId; readonly threadId: string; readonly runId: string; readonly status: import("@relkit/contracts").ControlStatus; readonly effect: import("@relkit/contracts").ControlEffectOutcome; readonly duplicate: boolean }';
const receiptFields = `readonly threadId?: string; readonly runId?: string; readonly operationId: import("@relkit/contracts").OperationId; readonly kind?: "agent-run" | "agent-control" | "continuation"; readonly requestDigest: string; ${expectedIdentity}`;
const receiptLookup = 'import("@relkit/contracts").ReceiptLookup<{ readonly threadId: string }>';
