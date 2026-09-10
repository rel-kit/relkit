import { isInterrupted } from "@langchain/langgraph";
import { normalizeId } from "@relkit/contracts";
import { currentInvocationScope, frameworkTrace, runInInvocationScope } from "@relkit/invocation";
import { graphExecution, type GraphDescriptor } from "./define-graph.js";
import { compileGraph } from "./graph-compile.js";
import { graphConfig, resumeCommand, waitingInterrupts } from "./graph-continuation.js";
import {
  GraphInterruptedError,
  graphWaitingResponse,
  publicWaitingRequests,
} from "./graph-interruption.js";
import { resolveGraphPersistence } from "./graph-persistence.js";
import { graphWorkflowRequiresPersistence } from "./graph-workflow.js";
import { generatedAgentFunctionId } from "./generated-function.js";
import { collectNativeEvents } from "./runtime-native-events.js";
import { resolveAgentContentLimits } from "./runtime-model.js";
import { selectedStateSchemas } from "./runtime-state-schemas.js";
import { createAgentInvocationDispatcher } from "./runtime-tool-adapter.js";
import {
  createExecutionSignal,
  jsonValue,
  signalFailure,
  validateValue,
  withSignal,
} from "./runtime-utils.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";

type GraphRuntimeOptions = AgentRuntimeOptions &
  AgentInvocationOptions & { readonly agent: GraphDescriptor };

export async function invokeGraph(options: GraphRuntimeOptions): Promise<unknown> {
  const invocationId = normalizeId(options.invocationId ?? `agent-${crypto.randomUUID()}`);
  const traceId = normalizeId(options.traceId ?? invocationId);
  const execution = createExecutionSignal(options);
  const limits = resolveAgentContentLimits(options);
  return frameworkTrace.span(
    `relkit.agent.${options.agent.id}.invoke`,
    {
      input: options.input,
      attributes: {
        "relkit.agent.id": options.agent.id,
        "relkit.function.id": generatedAgentFunctionId(options.agent.id),
        "relkit.invocation.id": invocationId,
        "relkit.agent.execution": "graph",
      },
    },
    async () => {
      try {
        if (execution.signal.aborted) throw signalFailure(execution.signal);
        const input = options.resume
          ? options.input
          : await withSignal(
              validateValue(options.agent.input, options.input, "input"),
              execution.signal,
            );
        return await runCompiledGraph(
          options,
          input,
          execution.signal,
          invocationId,
          traceId,
          limits.maxOutputBytes,
        );
      } finally {
        execution.close();
      }
    },
  );
}

async function runCompiledGraph(
  options: GraphRuntimeOptions,
  input: unknown,
  signal: AbortSignal,
  invocationId: string,
  traceId: string,
  maxOutputBytes: number,
): Promise<unknown> {
  const persistence = await resolveGraphPersistence(options.agent, options.environment ?? {});
  if (
    persistence.checkpointer === undefined &&
    graphWorkflowRequiresPersistence(options.agent.workflow)
  ) {
    throw new TypeError("Graphs with resumable nodes require a checkpointer");
  }
  const graph = compileGraph(options.agent, persistence);
  const config = graphConfig(options.agent, options.threadId);
  try {
    return await inAgentScope(options, signal, invocationId, traceId, async () => {
      const nativeInput = options.resume
        ? await resumeCommand(graph, options.agent, config, input)
        : input;
      const run = await withSignal(
        graph.streamEvents(nativeInput, {
          version: "v3",
          signal,
          recursionLimit: options.agent.limits.maxSteps,
          ...config,
        }),
        signal,
      );
      await collectNativeEvents(
        run,
        options.contentSink,
        new Map(),
        new Set(),
        signal,
        options.agent.limits,
        selectedStateSchemas(
          [graphExecution(options.agent).state],
          options.agent.client?.state ?? [],
        ),
        () => undefined,
        undefined,
        (reason) => run.abort(reason),
        options.agent.client?.events,
      );
      const state = await withSignal(run.output, signal);
      if (isInterrupted(state)) {
        const interrupts = await waitingInterrupts(graph, options.agent, config);
        await withSignal(
          options.contentSink?.emitWaiting?.(
            {
              response: graphWaitingResponse(interrupts),
              requests: publicWaitingRequests(interrupts),
            },
            signal,
          ),
          signal,
        );
        throw new GraphInterruptedError(options.threadId!, interrupts);
      }
      const validated = await validateValue(options.agent.output, state, "output");
      const output = jsonValue(validated, maxOutputBytes, "graph output");
      await withSignal(options.contentSink?.emitOutput(output, signal), signal);
      await withSignal(options.contentSink?.finishOutput?.(signal), signal);
      return output;
    });
  } catch (cause) {
    if (signal.aborted) throw signalFailure(signal);
    throw cause;
  }
}

async function inAgentScope<T>(
  options: GraphRuntimeOptions,
  signal: AbortSignal,
  invocationId: string,
  traceId: string,
  run: () => Promise<T>,
): Promise<T> {
  const current = currentInvocationScope();
  if (current !== undefined) return runInInvocationScope(current, run);
  const dispatcher = createAgentInvocationDispatcher(
    options.engine,
    options,
    invocationId,
    traceId,
    options.parentSpanId,
    signal,
  );
  return runInInvocationScope({ dispatcher, parent: { id: invocationId, traceId, signal } }, run);
}
