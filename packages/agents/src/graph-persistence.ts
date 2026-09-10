import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { graphExecution, isGraphDescriptor, type GraphDescriptor } from "./define-graph.js";
import { assertPersistenceProtocol, isPersistenceResource } from "./define-persistence.js";

export interface ResolvedGraphPersistence {
  readonly checkpointer?: BaseCheckpointSaver;
  readonly store?: BaseStore;
}

export interface AgentPersistenceDeclaration {
  readonly checkpointer?: unknown;
  readonly store?: unknown;
}

export async function resolveGraphPersistence(
  descriptor: GraphDescriptor,
  env: Readonly<Record<string, unknown>>,
): Promise<ResolvedGraphPersistence> {
  const execution = graphExecution(descriptor);
  const checkpointer = await resolve(execution.checkpointer, env);
  const store = await resolve(execution.store, env);
  return {
    ...(checkpointer === undefined ? {} : { checkpointer: checkpointer as BaseCheckpointSaver }),
    ...(store === undefined ? {} : { store: store as BaseStore }),
  };
}

export async function resolveAgentPersistence(
  descriptor: AgentPersistenceDeclaration,
  env: Readonly<Record<string, unknown>>,
): Promise<ResolvedGraphPersistence> {
  const checkpointer = await resolve(descriptor.checkpointer, env);
  const store = await resolve(descriptor.store, env);
  if (checkpointer !== undefined) assertPersistenceProtocol("checkpointer", checkpointer);
  if (store !== undefined) assertPersistenceProtocol("memory", store);
  return {
    ...(checkpointer === undefined ? {} : { checkpointer: checkpointer as BaseCheckpointSaver }),
    ...(store === undefined ? {} : { store: store as BaseStore }),
  };
}

async function resolve(value: unknown, env: Readonly<Record<string, unknown>>): Promise<unknown> {
  if (!isPersistenceResource(value)) return value;
  const resolved = await value.acquire({ env });
  assertPersistenceProtocol(value.resource, resolved);
  return resolved;
}

export async function releaseAgentPersistence(descriptors: readonly unknown[]): Promise<void> {
  const resources = descriptors.flatMap((descriptor) => {
    const persistence = isGraphDescriptor(descriptor)
      ? graphExecution(descriptor)
      : agentPersistence(descriptor);
    return persistence === undefined
      ? []
      : [persistence.checkpointer, persistence.store].filter(isPersistenceResource);
  });
  await Promise.all(resources.map((resource) => resource.release()));
}

function agentPersistence(value: unknown): AgentPersistenceDeclaration | undefined {
  if (
    value === null ||
    typeof value !== "object" ||
    (value as { kind?: unknown }).kind !== "agent"
  ) {
    return undefined;
  }
  return value as AgentPersistenceDeclaration;
}
