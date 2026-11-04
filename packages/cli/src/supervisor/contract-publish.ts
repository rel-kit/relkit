/**
 * Publishes backend contract changes to frontends during `relkit dev`.
 *
 * Frontends that use `@relkit/client` open `GET /_relkit/v1/client/contract-events` on the
 * stable development port. The stream lives in the supervisor, not in a backend generation,
 * so it survives generation switches and never holds a generation's drain open. After each
 * switch the supervisor calls {@link ContractPublisher.publish}; every open stream receives a
 * `contract` event and the client re-reads its identity document, adopting the new contract.
 */
import { CLIENT_CONTRACT_EVENTS_PATH } from "relkit/contracts";
import type { SupervisorTelemetry } from "./state-machine.types.js";

/** Interval between keep-alive comments, short enough for idle proxies. */
const KEEP_ALIVE_MS = 15_000;

/** Fans contract changes out to the frontends connected in development. */
export interface ContractPublisher {
  /**
   * Serves the contract event stream; leaves every other request to the caller.
   * @param request - Incoming request on the stable development port.
   * @returns The stream response, or undefined when the request is not for it.
   */
  readonly intercept: (request: Request) => Promise<Response> | undefined;
  /**
   * Tells every connected frontend that the active generation changed.
   * @param generation - The generation now serving traffic.
   */
  readonly publish: (generation: number) => void;
  /**
   * Publishes when a supervisor telemetry record reports a successful switch.
   * @param event - Supervisor lifecycle record.
   */
  readonly observe: (event: SupervisorTelemetry) => void;
  /** Ends every open stream; later requests are left to the caller. */
  readonly close: () => void;
  /** Number of open streams. */
  readonly connections: () => number;
}

/**
 * Creates a {@link ContractPublisher}.
 * @param options - Keep-alive interval, for tests.
 * @returns A publisher with no open streams.
 * @example
 * ```ts
 * const contracts = createContractPublisher();
 * createSupervisorProxy({ intercept: (request) => contracts.intercept(request) });
 * createSupervisorStateMachine({ onTelemetry: contracts.observe });
 * ```
 */
export function createContractPublisher(
  options: { readonly keepAliveMs?: number } = {},
): ContractPublisher {
  const encoder = new TextEncoder();
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let generation = 0;
  let closed = false;
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, text: string) => {
    try {
      controller.enqueue(encoder.encode(text));
    } catch {
      streams.delete(controller);
    }
  };
  const event = (name: string) => `event: ${name}\ndata: ${JSON.stringify({ generation })}\n\n`;
  const publish = (next: number) => {
    generation = next;
    for (const controller of streams) send(controller, event("contract"));
  };
  return {
    intercept(request) {
      if (closed || request.method !== "GET") return undefined;
      if (new URL(request.url).pathname !== CLIENT_CONTRACT_EVENTS_PATH) return undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      let own: ReadableStreamDefaultController<Uint8Array> | undefined;
      const release = () => {
        if (timer !== undefined) clearInterval(timer);
        if (own !== undefined) streams.delete(own);
      };
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          own = controller;
          streams.add(controller);
          send(controller, event("ready"));
          timer = setInterval(
            () => send(controller, ": keep-alive\n\n"),
            options.keepAliveMs ?? KEEP_ALIVE_MS,
          );
          // An idle stream must not keep `relkit dev` alive after its listener stops.
          (timer as { unref?: () => void }).unref?.();
          request.signal.addEventListener(
            "abort",
            () => {
              release();
              try {
                controller.close();
              } catch {
                /* Already closed. */
              }
            },
            { once: true },
          );
        },
        cancel: release,
      });
      return Promise.resolve(
        new Response(body, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            "access-control-allow-origin": request.headers.get("origin") ?? "*",
            "access-control-allow-credentials": "true",
            vary: "origin",
          },
        }),
      );
    },
    publish,
    observe(event) {
      if (event.type === "outcome" && event.outcome === "switch-succeeded")
        publish(event.generationToken);
    },
    close() {
      closed = true;
      for (const controller of streams) {
        try {
          controller.close();
        } catch {
          /* Already closed. */
        }
      }
      streams.clear();
    },
    connections: () => streams.size,
  };
}
