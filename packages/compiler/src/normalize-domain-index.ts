/**
 * Builds logical service/member indexes and derives public error exposure.
 * Only descriptor metadata is inspected; compiler normalization owns execution,
 * diagnostics and observation, and no application resource is acquired here.
 */
import { collectPublicMembers, validateDomainId } from "./normalize-domain-members.js";
import { add } from "./normalize-pass-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizationWork,
  type NormalizedDescriptor,
} from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";
import type { DomainMemberIndex } from "./normalize-domain-index.types.js";

/**
 * Resolves service declarations and their public members after owner assignment.
 * @param work - Invocation-owned descriptors and diagnostics.
 * @returns Service and member indexes with duplicate/invalid references reported.
 */
export function indexDomainMembers(work: NormalizationWork): DomainMemberIndex {
  const byId = new Map(
    work.descriptors.map((descriptor) => [`${descriptor.kind}:${descriptor.id}`, descriptor]),
  );
  const publicIds = new Set<string>();
  const services = new Map<string, NormalizedDescriptor>();
  for (const descriptor of work.descriptors) {
    if (descriptor.domainId === undefined) continue;
    validateDomainId(work, descriptor);
    if (descriptor.kind !== "service") continue;
    const previous = services.get(descriptor.domainId);
    if (previous)
      add(
        work,
        descriptor,
        NORMALIZE_CODES.domain,
        `Domain "${descriptor.domainId}" has multiple services.`,
        "error",
        previous,
      );
    else services.set(descriptor.domainId, descriptor);
    collectPublicMembers(work, descriptor, byId, publicIds);
  }
  return { services, publicIds };
}

/**
 * Marks public functions/events and errors declared by public callable members.
 * @param work - Descriptor accumulator whose exposure is updated.
 * @param publicIds - Valid public identities, qualified by kind.
 * @returns Nothing; internal channels/jobs/agents keep their independent exposure.
 */
export function assignDomainExposure(
  work: NormalizationWork,
  publicIds: ReadonlySet<string>,
): void {
  const publicErrorIds = new Set<string>();
  for (const descriptor of work.descriptors) {
    if (descriptor.kind !== "function" || !publicIds.has(`function:${descriptor.id}`)) continue;
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    if (!Array.isArray(value.errors)) continue;
    for (const error of value.errors) {
      const errorId = refId(error);
      if (errorId !== undefined) publicErrorIds.add(errorId);
    }
  }
  work.descriptors = work.descriptors.map((descriptor) => {
    if (!["function", "event", "error"].includes(descriptor.kind)) return descriptor;
    const exposed =
      publicIds.has(`${descriptor.kind}:${descriptor.id}`) || publicErrorIds.has(descriptor.id);
    return { ...descriptor, exposure: exposed ? "public" : "internal" };
  });
}
