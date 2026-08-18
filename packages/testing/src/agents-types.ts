import type {
  AgentApprovalHandler,
  AgentCapturePolicy,
  AgentDescriptor,
  AgentInvocationOptions,
  AgentObservedEdge,
  AgentRuntimeHooks,
  AgentRuntimeOptions,
  AgentSpanKind,
  AgentSpanRecord,
  ModelTurn,
  PendingApproval,
} from "@zsys/agents";
import type { FakeModelOptions, FakeModelProvider } from "@zsys/providers-local";
import type { InferInput, InferOutput } from "@zsys/schema";
import type { TestFailureControls } from "./fakes.js";

export type TestAgentDescriptor = AgentDescriptor<string, unknown, unknown>;
export type TestAgentApprovalMode = "approved" | "denied" | "pending";
export type TestAgentApproval = TestAgentApprovalMode | AgentApprovalHandler;

export interface TestAgentOptions<Agent extends TestAgentDescriptor = TestAgentDescriptor> {
  readonly agent: Agent;
  readonly tools: AgentRuntimeOptions["tools"];
  readonly engine: AgentRuntimeOptions["engine"];
  readonly script?: readonly ModelTurn[];
  readonly model?: FakeModelOptions;
  readonly approval?: TestAgentApproval;
  readonly failures?: TestFailureControls;
  readonly hooks?: AgentRuntimeHooks;
  readonly capture?: AgentCapturePolicy;
}

export type TestAgentInvocationOptions = Omit<
  AgentInvocationOptions,
  "input" | "approval" | "hooks"
>;

export interface TestAgentTraceSnapshot {
  readonly spans: readonly AgentSpanRecord[];
  readonly edges: readonly AgentObservedEdge[];
}

export interface TestAgentTrace extends TestAgentTraceSnapshot {
  readonly read: () => TestAgentTraceSnapshot;
  readonly clear: () => void;
  readonly assert: (expected: TestAgentTraceExpectation) => void;
}

export interface TestAgentTraceExpectation {
  readonly spanKinds?: readonly AgentSpanKind[];
  readonly names?: readonly string[];
  readonly edges?: readonly AgentObservedEdge[];
}

export interface TestAgentApprovals {
  readonly pending: () => readonly PendingApproval[];
  readonly approve: (toolCallId?: string) => void;
  readonly deny: (toolCallId?: string) => void;
}

export interface TestAgent<Agent extends TestAgentDescriptor = TestAgentDescriptor> {
  readonly model: FakeModelProvider;
  readonly provider: FakeModelProvider;
  readonly failures: TestFailureControls;
  readonly approvals: TestAgentApprovals;
  readonly pending: () => readonly PendingApproval[];
  readonly trace: TestAgentTrace;
  readonly script: (turns: readonly ModelTurn[]) => void;
  readonly invoke: (
    input: InferInput<Agent["input"]>,
    options?: TestAgentInvocationOptions,
  ) => Promise<InferOutput<Agent["output"]>>;
  readonly reset: () => void;
}
