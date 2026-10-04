import type { AgentObservedEdge, AgentRuntimeHooks } from "@relkit/agents";
import type { spanSnapshot } from "@relkit/invocation";
import type {
  TestAgentTrace,
  TestAgentTraceExpectation,
  TestAgentTraceSnapshot,
} from "./agents-types.js";

/**
 * Asserts selected native agent trace fields in their observed order.
 * @param trace - Captured native trace assertion snapshot.
 * @param expected - Existing expected status or ordered captured values.
 * @returns Nothing when the existing assertion contract matches.
 */
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

/**
 * Creates isolated trace capture and the existing assertion facade.
 * @param spans - Owner-local native span snapshots.
 * @param edges - Compiled native graph relationships or captured agent relationship ledger.
 * @returns A native trace helper exposing detached inspection and clear operations.
 */
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

/**
 * Records observed agent edges while forwarding the caller's native hooks.
 * @param hooks - Caller-native hooks forwarded without changing ordering.
 * @param edges - Compiled native graph relationships or captured agent relationship ledger.
 * @returns Hooks preserving native callback order and caller behavior.
 */
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

/**
 * Compares existing assertion values through their canonical representation.
 * @param left - First existing assertion value.
 * @param right - Second existing assertion value.
 * @returns True when the expected ordered values match.
 */
function same(left: readonly unknown[], right: readonly unknown[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Compares the existing agent relationship and endpoint fields.
 * @param left - First existing assertion value.
 * @param right - Second existing assertion value.
 * @returns True when both native observed edges match.
 */
function sameEdge(left: AgentObservedEdge, right: AgentObservedEdge): boolean {
  return (
    left.relationship === right.relationship && left.from === right.from && left.to === right.to
  );
}
