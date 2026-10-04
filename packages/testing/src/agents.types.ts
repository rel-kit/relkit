import type {
  AgentApprovalHandler,
  AgentCapturePolicy,
  AgentDescriptor,
  AgentInvocationOptions,
  AgentObservedEdge,
  AgentRuntimeHooks,
  AgentRuntimeOptions,
  PendingApproval,
} from "@relkit/agents";
import type { spanSnapshot } from "@relkit/invocation";
import type { JsonValue } from "@relkit/contracts";
import type { InferInput, InferOutput } from "@relkit/schema";
import type { TestFailureControls } from "./fakes.js";

/** Native agent descriptor vocabulary retained by public test inference. */
export type TestAgentDescriptor = AgentDescriptor<string, unknown, unknown>;

/** Fixed or pending native approval policy vocabulary. */
export type TestAgentApprovalMode = "approved" | "denied" | "pending";

/** Fixed, pending or caller-native approval decision authority. */
export type TestAgentApproval = TestAgentApprovalMode | AgentApprovalHandler;

/** Scripted native model outcome supporting final values, tool calls and failures. */
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

/** Network-free model identity, hanging behavior and explicit logging policy. */
export interface TestAgentModelOptions {
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
  readonly provider?: string;
  readonly modelId?: string;
  readonly hang?: boolean;
}

/** Detached native request and scripted turn evidence captured in order. */
export interface TestAgentModelCall {
  readonly index: number;
  readonly request: {
    readonly messages: readonly unknown[];
    readonly tools: readonly unknown[];
  };
  readonly turn: TestModelTurn;
}

/** Public model facade owning script mutation, capture and release. */
export interface TestAgentModel {
  readonly provider: string;
  readonly modelId: string;
  readonly calls: readonly TestAgentModelCall[];
  readonly script: (turns: readonly TestModelTurn[]) => void;
  readonly reset: () => void;
  readonly close: () => Promise<void>;
}

/**
 * Native agent, tool engine, model script and capture dependencies.
 * @typeParam Agent - Native descriptor determining input/output schema inference.
 */
export interface TestAgentOptions<Agent extends TestAgentDescriptor = TestAgentDescriptor> {
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
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

/** Invocation-only native overrides excluding owned model and engine dependencies. */
export type TestAgentInvocationOptions = Omit<
  AgentInvocationOptions,
  "input" | "approval" | "hooks"
>;

/** Detached observed span and edge evidence for a test invocation. */
export interface TestAgentTraceSnapshot {
  readonly spans: readonly ReturnType<typeof spanSnapshot>[];
  readonly edges: readonly AgentObservedEdge[];
}

/** Owned trace evidence with explicit read, clear and assertion operations. */
export interface TestAgentTrace extends TestAgentTraceSnapshot {
  readonly read: () => TestAgentTraceSnapshot;
  readonly clear: () => void;
  readonly assert: (expected: TestAgentTraceExpectation) => void;
}

/** Selected span, outcome and tool-edge evidence checked by trace assertions. */
export interface TestAgentTraceExpectation {
  readonly spanKinds?: readonly ReturnType<typeof spanSnapshot>["kind"][];
  readonly names?: readonly string[];
  readonly edges?: readonly AgentObservedEdge[];
}

/** Synchronous selection controls over owned pending native decisions. */
export interface TestAgentApprovals {
  readonly pending: () => readonly PendingApproval[];
  readonly approve: (toolCallId?: string) => void;
  readonly deny: (toolCallId?: string) => void;
}

/**
 * Owned native agent facade preserving schema inference, approvals and trace evidence.
 * @typeParam Agent - Native descriptor determining input/output schema inference.
 */
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
  readonly close: () => Promise<void>;
}
