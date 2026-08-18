import type { AgentObservedEdge, AgentRuntimeHooks, AgentSpanRecord } from "@zsys/agents";
import type {
  TestAgentTrace,
  TestAgentTraceExpectation,
  TestAgentTraceSnapshot,
} from "./agents-types.js";

export function assertAgentTrace(
  trace: TestAgentTraceSnapshot,
  expected: TestAgentTraceExpectation,
): void {
  if (
    expected.spanKinds !== undefined &&
    !same(
      trace.spans.map((span) => span.kind),
      expected.spanKinds,
    )
  ) {
    throw new Error(
      `Unexpected agent span kinds: ${JSON.stringify(trace.spans.map((span) => span.kind))}`,
    );
  }
  if (
    expected.names !== undefined &&
    !same(
      trace.spans.map((span) => span.name),
      expected.names,
    )
  ) {
    throw new Error(
      `Unexpected agent span names: ${JSON.stringify(trace.spans.map((span) => span.name))}`,
    );
  }
  const spanIds = new Set(trace.spans.map((span) => span.spanId));
  if (
    trace.spans.some((span) => span.parentSpanId !== undefined && !spanIds.has(span.parentSpanId))
  ) {
    throw new Error("Agent trace contains a span with a missing parent");
  }
  for (const edge of expected.edges ?? []) {
    if (!trace.edges.some((actual) => sameEdge(actual, edge))) {
      throw new Error(`Missing agent edge: ${JSON.stringify(edge)}`);
    }
  }
}

export function createTrace(spans: AgentSpanRecord[], edges: AgentObservedEdge[]): TestAgentTrace {
  const trace = {
    get spans() {
      return Object.freeze([...spans]);
    },
    get edges() {
      return Object.freeze([...edges]);
    },
    read: () => ({ spans: Object.freeze([...spans]), edges: Object.freeze([...edges]) }),
    clear: () => {
      spans.length = 0;
      edges.length = 0;
    },
    assert: (expected: TestAgentTraceExpectation) => assertAgentTrace(trace, expected),
  };
  return trace;
}

export function captureHooks(
  hooks: AgentRuntimeHooks | undefined,
  spans: AgentSpanRecord[],
  edges: AgentObservedEdge[],
): AgentRuntimeHooks {
  return {
    ...hooks,
    onSpanStart: (record) => {
      spans.push(record);
      return hooks?.onSpanStart?.(record);
    },
    onSpanComplete: (record) => {
      spans.push(record);
      return hooks?.onSpanComplete?.(record);
    },
    onObservedEdge: (edge) => {
      edges.push(edge);
      hooks?.onObservedEdge?.(edge);
    },
  };
}

function same(left: readonly unknown[], right: readonly unknown[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameEdge(left: AgentObservedEdge, right: AgentObservedEdge): boolean {
  return (
    left.relationship === right.relationship && left.from === right.from && left.to === right.to
  );
}
