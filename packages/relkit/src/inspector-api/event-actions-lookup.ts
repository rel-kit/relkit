/**
 * Lookups for the development server's event actions: the declared payload schema of an event in
 * the application's descriptors, and a publication or delivery across the event providers of the
 * declared profiles. Providers are read only through their public `query`, page by page and
 * bounded, so a lookup never scans an unbounded history.
 */
import { PROTOCOL_VERSION } from "relkit/contracts";
import type { InspectorEventActionsOptions } from "./actions.types.js";
import { isRecord } from "./shared.js";

/** Pages of 100 deliveries read before a delivery is reported as unknown. */
const MAX_DELIVERY_PAGES = 10;

/** Standard Schema validator as carried by an event descriptor. */
type PayloadSchema = Parameters<
  typeof import("relkit/events").createEventClient
>[0]["payloadSchema"];

/**
 * Finds the payload schema of an event in the application's descriptors: an event a function
 * publishes or consumes, or one a service declares.
 * @param descriptors - Function, target and service descriptors of the application.
 * @param eventId - Event identifier.
 * @param version - Event version.
 * @returns The Standard Schema validator, or undefined when no descriptor declares it.
 */
export function eventSchema(
  descriptors: Iterable<unknown>,
  eventId: string,
  version: number,
): PayloadSchema | undefined {
  for (const descriptor of descriptors) {
    if (!isRecord(descriptor)) continue;
    const dependencies = isRecord(descriptor.dependencies) ? descriptor.dependencies : {};
    const candidates = [
      descriptor,
      descriptor.event,
      ...(isRecord(dependencies.events) ? Object.values(dependencies.events) : []),
      ...(isRecord(descriptor.events) ? Object.values(descriptor.events) : []),
    ];
    for (const candidate of candidates) {
      if (
        isRecord(candidate) &&
        candidate.kind === "event" &&
        candidate.id === eventId &&
        (candidate.version ?? 1) === version &&
        isRecord(candidate.input) &&
        isRecord(candidate.input["~standard"])
      )
        return candidate.input as unknown as PayloadSchema;
    }
  }
  return undefined;
}

/**
 * Finds a publication, with its stored payload when the provider returns it, by instance id.
 * @param options - Event action options.
 * @param publicationId - Publication instance id.
 * @returns The publication record and its provider, or undefined when no provider knows it.
 */
export async function findPublication(
  options: InspectorEventActionsOptions,
  publicationId: string,
): Promise<
  { readonly publication: Record<string, unknown>; readonly provider: unknown } | undefined
> {
  for (const profile of profiles(options)) {
    const provider = await options.provider(profile);
    const page = await query(provider, { publicationId, limit: 100 });
    const publication = records(page?.publications).find(
      (record) => record.instanceId === publicationId,
    );
    if (publication !== undefined) return { publication, provider };
  }
  return undefined;
}

/**
 * Finds a delivery by id, reading at most {@link MAX_DELIVERY_PAGES} pages per provider.
 * @param options - Event action options.
 * @param deliveryId - Delivery id.
 * @returns The delivery record and its provider, or undefined when no provider knows it.
 */
export async function findDelivery(
  options: InspectorEventActionsOptions,
  deliveryId: string,
): Promise<{ readonly delivery: Record<string, unknown>; readonly provider: unknown } | undefined> {
  for (const profile of profiles(options)) {
    const provider = await options.provider(profile);
    let cursor: string | undefined;
    for (let page = 0; page < MAX_DELIVERY_PAGES; page++) {
      const result = await query(provider, {
        limit: 100,
        ...(cursor === undefined ? {} : { cursor }),
      });
      const delivery = records(result?.deliveries).find(
        (record) => record.deliveryId === deliveryId,
      );
      if (delivery !== undefined) return { delivery, provider };
      cursor = typeof result?.nextCursor === "string" ? result.nextCursor : undefined;
      if (cursor === undefined) break;
    }
  }
  return undefined;
}

/**
 * Lists the declared event profiles once each, in a stable order.
 * @param options - Event action options.
 * @returns Sorted profile names.
 */
function profiles(options: InspectorEventActionsOptions): readonly string[] {
  return [...new Set(options.events.map((event) => event.profile))].sort();
}

/**
 * Calls a provider's public inspection query.
 * @param provider - Event provider.
 * @param filters - Query filters.
 * @returns The query page, or undefined when the provider has no query.
 */
async function query(
  provider: unknown,
  filters: Record<string, string | number>,
): Promise<Record<string, unknown> | undefined> {
  if (!isRecord(provider) || typeof provider.query !== "function") return undefined;
  const page: unknown = await provider.query({
    protocol: "relkit.events.admin",
    version: PROTOCOL_VERSION,
    ...filters,
  });
  return isRecord(page) ? page : undefined;
}

/**
 * Keeps the record entries of a provider collection.
 * @param value - Candidate collection.
 * @returns Its record entries.
 */
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
