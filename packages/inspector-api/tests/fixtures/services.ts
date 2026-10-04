import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import type { InspectorActionRequest } from "../../src/actions.types.js";
import type { ResolvedActiveGeneration } from "../../src/shared.types.js";
import type { InspectorJobsBinding } from "../../src/jobs/jobs.types.js";
import type { NativeGate } from "./services.types.js";

/** Stable generation identity for deterministic owner and receipt tests. */
export const generationIdentity = { generationId: "generation-one", graphHash: "sha256:one" };

/**
 * Creates a native Promise whose completion the test controls explicitly.
 * @typeParam A - Successful native result.
 * @returns A gate supporting success and failure without starting domain work.
 */
export function nativeGate<A>(): NativeGate<A> {
  let resolve!: (value: A) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<A>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/**
 * Builds the smallest resolved generation; authority fixtures remain caller-owned.
 * @param overrides - Graph and native authorities needed by the individual test.
 * @returns A resolved active generation with stable identity.
 */
export function generation(
  overrides: Partial<ResolvedActiveGeneration> = {},
): ResolvedActiveGeneration {
  return { ...generationIdentity, ...overrides };
}

/**
 * Constructs a validated function action with caller-controlled inputs.
 * @param body - Native action input fields.
 * @returns A request sharing one authoritative idempotency key.
 */
export function actionRequest(
  body: Record<string, unknown> = { input: { order: 1 } },
): InspectorActionRequest {
  return {
    ...generationIdentity,
    action: "function.invoke",
    targetId: "orders.create",
    idempotencyKey: "request-one",
    body,
  };
}

/**
 * Declares a native job binding with an explicit run-page authority.
 * @param service - Stable declaration label.
 * @param list - Native page operation controlled by the test.
 * @returns A binding whose unused detail operation fails loudly.
 */
export function jobBinding(
  service: string,
  list: InspectorJobsBinding["list"] = () => emptyPage(),
): InspectorJobsBinding {
  return {
    service,
    serviceGeneration: "service-one",
    list,
    get: () => {
      throw new Error("unused job detail");
    },
  };
}

/**
 * Supplies a valid empty native run page without inventing count evidence.
 * @returns An exhausted native page.
 */
export function emptyPage(): RunPage<RunSnapshot> {
  return { items: [], hasMore: false, availability: [] };
}
