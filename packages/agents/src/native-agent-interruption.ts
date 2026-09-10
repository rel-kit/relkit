import { Command } from "@langchain/langgraph";
import { validate } from "@cfworker/json-schema";
import type { GraphWaitingInterrupt } from "./graph-interruption.js";
import {
  hitlResponseSchema,
  isDecision,
  isHitlRequest,
  isRecord,
  publicHitlRequest,
  type ReviewConfig,
} from "./native-agent-interruption-schema.js";
import type { AgentWaitingRequest } from "./state-types.js";

type NativeAgent = Pick<ReturnType<typeof import("langchain").createAgent>, "getState">;
type NativeAgentConfig = Parameters<NativeAgent["getState"]>[0];

export async function nativeAgentResumeCommand(
  agent: NativeAgent,
  config: NativeAgentConfig,
  value: unknown,
): Promise<Command> {
  const requests = await nativeAgentWaitingInterrupts(agent, config);
  const reply = validateNativeAgentResumeInput(requests, value);
  const replies = requests.length === 1 ? [reply] : (reply as readonly unknown[]);
  return new Command({
    resume: Object.fromEntries(
      requests.map((request, index) => {
        if (request.id === undefined) throw new TypeError("Agent interruption has no native ID");
        return [request.id, replies[index]];
      }),
    ),
  });
}

export async function nativeAgentWaitingInterrupts(
  agent: NativeAgent,
  config: NativeAgentConfig,
): Promise<readonly GraphWaitingInterrupt[]> {
  return snapshotInterrupts(await agent.getState(config, { subgraphs: true }), []);
}

export function validateNativeAgentResumeInput(
  requests: readonly AgentWaitingRequest[],
  value: unknown,
): unknown {
  if (requests.length === 0) throw new TypeError("Agent has no waiting continuation");
  if (requests.length === 1) return validateReply(requests[0]!, value);
  if (!Array.isArray(value) || value.length !== requests.length) {
    throw new TypeError(`Agent continuation requires ${requests.length} replies`);
  }
  return requests.map((request, index) => validateReply(request, value[index]));
}

function snapshotInterrupts(snapshot: unknown, path: readonly string[]): GraphWaitingInterrupt[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.tasks)) return [];
  return snapshot.tasks.flatMap((task): GraphWaitingInterrupt[] => {
    if (!isRecord(task)) return [];
    const name = typeof task.name === "string" ? task.name : "human-input";
    if (isRecord(task.state) && Array.isArray(task.state.tasks)) {
      return snapshotInterrupts(task.state, [...path, name]);
    }
    if (!Array.isArray(task.interrupts)) return [];
    return task.interrupts.flatMap((entry): GraphWaitingInterrupt[] => {
      if (!isRecord(entry) || !isHitlRequest(entry.value)) return [];
      const value = publicHitlRequest(entry.value);
      return [
        {
          ...(typeof entry.id === "string" ? { id: entry.id } : {}),
          node: [...path, name].join("/"),
          value,
          response: hitlResponseSchema(value.reviewConfigs),
        },
      ];
    });
  });
}

function validateReply(request: AgentWaitingRequest, value: unknown): unknown {
  const requestValue = request.value;
  if (!isHitlRequest(requestValue) || !isRecord(value) || !Array.isArray(value.decisions)) {
    throw new TypeError("Agent continuation requires human decisions");
  }
  if (Object.keys(value).some((key) => key !== "decisions")) {
    throw new TypeError("Agent continuation has unknown fields");
  }
  if (value.decisions.length !== requestValue.reviewConfigs.length) {
    throw new TypeError("Agent continuation decision count is invalid");
  }
  return {
    decisions: value.decisions.map((decision, index) =>
      validateDecision(decision, requestValue.reviewConfigs[index]!),
    ),
  };
}

function validateDecision(value: unknown, config: ReviewConfig): unknown {
  if (
    !isRecord(value) ||
    !isDecision(value.type) ||
    !config.allowedDecisions.includes(value.type)
  ) {
    throw new TypeError("Agent continuation decision is not allowed");
  }
  if (value.type === "approve") {
    exactKeys(value, ["type"]);
    return { type: "approve" };
  }
  if (value.type === "reject") {
    exactKeys(value, ["type", "message"]);
    if (value.message !== undefined && typeof value.message !== "string") {
      throw new TypeError("Agent rejection message must be text");
    }
    return { type: "reject", ...(value.message === undefined ? {} : { message: value.message }) };
  }
  exactKeys(value, ["type", "editedAction"]);
  if (
    !isRecord(value.editedAction) ||
    value.editedAction.name !== config.actionName ||
    !isRecord(value.editedAction.args)
  ) {
    throw new TypeError("Agent edited action is invalid");
  }
  exactKeys(value.editedAction, ["name", "args"]);
  if (
    config.argsSchema !== undefined &&
    !validate(value.editedAction.args, config.argsSchema as never).valid
  ) {
    throw new TypeError("Agent edited action arguments are invalid");
  }
  return { type: "edit", editedAction: value.editedAction };
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError("Agent continuation has unknown fields");
  }
}
