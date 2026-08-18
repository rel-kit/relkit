import { API_BASE_PATH, PROTOCOL_VERSION } from "@zsys/contracts";
import { Hono } from "hono";
import { installInspectorEndpoints, type InspectorActionServices } from "./src/index.ts";

export const identity = { generationId: "generation-one", graphHash: "sha256:one" };

export interface ActionTestState {
  readonly app: Hono;
  readonly actions: InspectorActionServices;
  readonly audits: readonly unknown[];
  readonly approvals: Map<string, string>;
  readonly calls: () => number;
  readonly setActive: (generation: ActionTestGeneration) => void;
}

export interface ActionTestGeneration {
  readonly generationId: string;
  readonly graphHash: string;
  readonly actions?: InspectorActionServices;
}

export function makeGeneration(): ActionTestGeneration {
  return { ...identity };
}

export function setup(): ActionTestState {
  let active = makeGeneration();
  let functionCalls = 0;
  let jobState = "dead-lettered";
  let eventState = "dead-lettered";
  const approvals = new Map([
    ["call-1", "pending"],
    ["call-2", "pending"],
  ]);
  const audits: unknown[] = [];
  const actions: InspectorActionServices = {
    functions: {
      exists: async (id: string) => id === "orders.create",
      invoke: async () => {
        functionCalls += 1;
        return {
          ok: true,
          handler: () => "must-not-cross",
          password: "raw-secret",
          providerFile: "/private/provider.ts",
        };
      },
    },
    jobs: {
      protocol: "zsys.jobs.admin",
      version: PROTOCOL_VERSION,
      status: async (id: string) =>
        id === "job-ineligible"
          ? { instanceId: id, state: "available" }
          : { instanceId: id, state: jobState },
      retry: async (request: { instanceId: string }) => {
        jobState = "available";
        return {
          action: "retry",
          status: { instanceId: request.instanceId, state: jobState, handler: "raw-handler" },
          record: { action: "retry", instanceId: request.instanceId, input: "must-not-cross" },
        };
      },
      cancel: async (request: { instanceId: string }) => ({
        action: "cancel",
        status: { instanceId: request.instanceId, state: "cancelled" },
        record: { action: "cancel", instanceId: request.instanceId },
      }),
    },
    events: {
      protocol: "zsys.events.admin",
      version: PROTOCOL_VERSION,
      status: async () => ({ state: eventState }),
      retry: async (request: { deliveryId: string }) => {
        eventState = "available";
        return {
          action: "retry",
          status: { deliveryId: request.deliveryId, state: eventState },
          record: { action: "retry", deliveryId: request.deliveryId },
        };
      },
      cancel: async (request: { deliveryId: string }) => ({
        action: "cancel",
        status: { deliveryId: request.deliveryId, state: "cancelled" },
        record: { action: "cancel", deliveryId: request.deliveryId },
      }),
    },
    approvals: {
      get: async (request: { toolCallId: string }) => {
        const state = approvals.get(request.toolCallId);
        return state === undefined
          ? undefined
          : {
              invocationId: "invocation-1",
              toolCallId: request.toolCallId,
              toolId: "email.send",
              state: state as "pending" | "approved" | "denied",
              handler: "must-not-cross",
            };
      },
      approve: async (request: { toolCallId: string }) => {
        approvals.set(request.toolCallId, "approved");
        return {
          invocationId: "invocation-1",
          toolCallId: request.toolCallId,
          toolId: "email.send",
          state: "approved",
          handler: "must-not-cross",
        };
      },
      deny: async (request: { toolCallId: string }) => {
        approvals.set(request.toolCallId, "denied");
        return {
          invocationId: "invocation-1",
          toolCallId: request.toolCallId,
          toolId: "email.send",
          state: "denied",
        };
      },
    },
    audit: async (record: unknown) => {
      audits.push(record);
    },
  };
  const app = new Hono();
  installInspectorEndpoints(app, { getActiveGeneration: () => active });
  return {
    app,
    actions,
    audits,
    approvals,
    calls: () => functionCalls,
    setActive: (generation) => {
      active = generation;
    },
  };
}

export function activate(state: ActionTestState, generation = makeGeneration()): void {
  state.setActive({ ...generation, actions: state.actions });
}

export async function post(
  app: Hono,
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<Response> {
  return app.request(API_BASE_PATH + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
