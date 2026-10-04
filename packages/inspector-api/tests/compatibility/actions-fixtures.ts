import { API_BASE_PATH, PROTOCOL_VERSION } from "@relkit/contracts";
import { Hono } from "hono";
import { installInspectorEndpoints, type InspectorActionServices } from "../../src/index.ts";
import type { ActionTestState, ActionTestGeneration } from "./actions-fixtures.types.js";
export type { ActionTestState, ActionTestGeneration } from "./actions-fixtures.types.js";

export const identity = { generationId: "generation-one", graphHash: "sha256:one" };

/** @returns A stored generation with the stable compatibility identity. */
export function makeGeneration(): ActionTestGeneration {
  return { ...identity };
}

/** @returns Native action fixture authorities and their existing assertion counters. */
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
      protocol: "relkit.jobs.admin",
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
      protocol: "relkit.events.admin",
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

/**
 * Installs the fixture action authorities on the selected active generation.
 * @param state - Native fixture state observed by the unchanged compatibility assertions.
 * @param generation - Stored generation identity to activate.
 * @returns No value; the next native request reads this stored generation.
 */
export function activate(state: ActionTestState, generation = makeGeneration()): void {
  state.setActive({ ...generation, actions: state.actions });
}

/**
 * Sends the existing native Hono action request used by the compatibility assertions.
 * @param app - Installed native fixture router.
 * @param path - Existing action route suffix.
 * @param body - Stored JSON request fields.
 * @param headers - Optional native identity or protection headers.
 * @returns The unchanged native response.
 */
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
