/**
 * Event actions of a generated development server: publish and replay through the application's
 * own event client, and delivery status, retry and cancel through the event provider.
 *
 * Publish validates the payload against the event's declared schema (taken from the
 * application's descriptors) and publishes with the same client a function uses, so the envelope,
 * trace propagation and deliveries are the real ones. Replay uses the provider's own `replay` when
 * it has one; otherwise it publishes the stored payload of the publication again, which requires
 * the provider to return that payload when queried by `publicationId`. A provider that offers
 * neither, or no `retry`/`cancel`, answers `RELKIT_INSPECTOR_ACTION_UNSUPPORTED` (HTTP 501).
 */
import { PROTOCOL_VERSION } from "relkit/contracts";
import { createEventClient } from "relkit/events";
import { InspectorActionError } from "./actions-errors.js";
import type {
  InspectorEventActionRequest,
  InspectorEventActionService,
  InspectorEventActionsOptions,
  InspectorEventPublishRequest,
  InspectorEventReplayRequest,
} from "./actions.types.js";
import { eventSchema, findDelivery, findPublication } from "./event-actions-lookup.js";
import { isRecord } from "./shared.js";

/** Owner recorded on Inspector publications; never a function of the application. */
const INSPECTOR_OWNER = "relkit.inspector";

/**
 * Creates the event action service of a development server.
 * @param options - Declared events, provider lookup and the application's descriptors.
 * @returns The `relkit.events.admin` service the inspection API dispatches to.
 * @example
 * ```ts
 * const events = createInspectorEventActions({ events: plan.events, provider, descriptors });
 * await events.publish?.({ protocol: "relkit.events.admin", version: 1, eventId: "orders.placed",
 *   payload: { orderId: "o-1" }, idempotencyKey: "k-1" });
 * ```
 */
export function createInspectorEventActions(
  options: InspectorEventActionsOptions,
): InspectorEventActionService {
  const publishPayload = async (
    eventId: string,
    eventVersion: number | undefined,
    payload: unknown,
    publishOptions: { readonly key?: string; readonly attributes?: object } = {},
  ) => {
    const node = options.events
      .filter((event) => event.id === eventId)
      .filter((event) => eventVersion === undefined || event.version === eventVersion)
      .sort((left, right) => right.version - left.version)[0];
    if (node === undefined)
      throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_NOT_FOUND", 404);
    const payloadSchema = eventSchema(options.descriptors(), node.id, node.version);
    // Without the declared schema the payload cannot be validated, so it is not published.
    if (payloadSchema === undefined) throw unsupported();
    const client = createEventClient({
      ownerId: INSPECTOR_OWNER,
      eventId: node.id,
      version: node.version,
      profile: node.profile,
      source: await options.provider(node.profile),
      payloadSchema,
    });
    const result = await client.publish(payload as never, publishOptions as never);
    return {
      eventId: result.eventId,
      version: result.version,
      instanceId: result.instanceId,
      publishedAt: result.publishedAt,
    };
  };
  return Object.freeze({
    protocol: "relkit.events.admin",
    version: PROTOCOL_VERSION,
    publish: (request: InspectorEventPublishRequest) =>
      publishPayload(request.eventId, request.eventVersion, request.payload),
    replay: async (request: InspectorEventReplayRequest) => {
      const found = await findPublication(options, request.publicationId);
      if (found === undefined)
        throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_NOT_FOUND", 404);
      const native = isRecord(found.provider) ? found.provider.replay : undefined;
      if (typeof native === "function") return native.call(found.provider, request);
      const publication = found.publication;
      if (!("payload" in publication)) throw unsupported();
      const published = await publishPayload(
        String(publication.eventId),
        typeof publication.version === "number" ? publication.version : undefined,
        publication.payload,
        {
          ...(typeof publication.key === "string" ? { key: publication.key } : {}),
          ...(isRecord(publication.attributes) ? { attributes: publication.attributes } : {}),
        },
      );
      return { replayOf: request.publicationId, ...published };
    },
    status: async (deliveryId: string) =>
      (await findDelivery(options, deliveryId))?.delivery ?? undefined,
    retry: (request: InspectorEventActionRequest) => administer(options, "retry", request),
    cancel: (request: InspectorEventActionRequest) => administer(options, "cancel", request),
  });
}

/**
 * Applies a provider's own retry or cancel to the delivery's provider.
 * @param options - Event action options.
 * @param operation - Provider method name.
 * @param request - Delivery administration request.
 * @returns The provider's result.
 */
async function administer(
  options: InspectorEventActionsOptions,
  operation: "retry" | "cancel",
  request: InspectorEventActionRequest,
): Promise<unknown> {
  const found = await findDelivery(options, request.deliveryId);
  if (found === undefined) throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_NOT_FOUND", 404);
  const method = isRecord(found.provider) ? found.provider[operation] : undefined;
  if (typeof method !== "function") throw unsupported();
  return method.call(found.provider, request);
}

/** @returns The coded refusal for an action the event provider does not offer. */
function unsupported(): InspectorActionError {
  return new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501);
}
