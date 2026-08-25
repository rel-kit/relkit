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
  PendingApproval,
} from "@zsys/agents";
import type { JsonValue } from "@zsys/contracts";
import type { InferInput, InferOutput } from "@zsys/schema";
import type { TestFailureControls } from "./fakes.js";

export type TestAgentDescriptor = AgentDescriptor<string, unknown, unknown>;
export type TestAgentApprovalMode = "approved" | "denied" | "pending";
export type TestAgentApproval = TestAgentApprovalMode | AgentApprovalHandler;

export type TestModelTurn =
  | {
      readonly type: "tool-call";
      readonly callId: string;
      readonly toolId: string;
      readonly input: JsonValue;
    }
  | { readonly type: "final"; readonly output: JsonValue }
  | { readonly type: "error"; readonly code: string; readonly message: string }
  | { readonly type: "cancelled"; readonly reason?: string };

export interface TestAgentModelOptions {
  readonly provider?: string;
  readonly modelId?: string;
  readonly hang?: boolean;
}

export interface TestAgentModelCall {
  readonly index: number;
  readonly request: {
    readonly messages: readonly unknown[];
    readonly tools: readonly unknown[];
  };
  readonly turn: TestModelTurn;
}

export interface TestAgentModel {
  readonly provider: string;
  readonly modelId: string;
  readonly calls: readonly TestAgentModelCall[];
  readonly script: (turns: readonly TestModelTurn[]) => void;
  readonly reset: () => void;
}

export interface TestAgentOptions<Agent extends TestAgentDescriptor = TestAgentDescriptor> {
  readonly agent: Agent;
  readonly tools: AgentRuntimeOptions["tools"];
  readonly engine: AgentRuntimeOptions["engine"];
  readonly script?: readonly TestModelTurn[];
  readonly model?: TestAgentModelOptions;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
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
  readonly model: TestAgentModel;
  readonly failures: TestFailureControls;
  readonly approvals: TestAgentApprovals;
  readonly pending: () => readonly PendingApproval[];
  readonly trace: TestAgentTrace;
  readonly script: (turns: readonly TestModelTurn[]) => void;
  readonly invoke: (
    input: InferInput<Agent["input"]>,
    options?: TestAgentInvocationOptions,
  ) => Promise<InferOutput<Agent["output"]>>;
  readonly reset: () => void;
}
