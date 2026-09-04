import type { AgentObservedEdge, AgentRuntimeHooks } from "@relkit/agents";
import type { spanSnapshot } from "@relkit/invocation";
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
  for (const edge of expected.edges ?? []) {
    if (!trace.edges.some((actual) => sameEdge(actual, edge))) {
      throw new Error(`Missing agent edge: ${JSON.stringify(edge)}`);
    }
  }
}

export function createTrace(
  spans: ReturnType<typeof spanSnapshot>[],
  edges: AgentObservedEdge[],
): TestAgentTrace {
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
  edges: AgentObservedEdge[],
): AgentRuntimeHooks {
  return {
    ...hooks,
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
