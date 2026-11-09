/**
 * Validates logical service IDs and public member references after shared layout
 * assignment. These metadata calculations update only the caller's diagnostics
 * and member set; the owning normalization Effect supplies observation and lifetime.
 */
import { add } from "./normalize-pass-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";

const SERVICE_BASE_FIELDS = new Set([
  "kind",
  "id",
  "ref",
  "title",
  "description",
  "tags",
  "capability",
  "handler",
]);

/**
 * Checks a descriptor's logical identity against its evidenced owner.
 * @param work - Invocation-owned normalization diagnostics.
 * @param descriptor - Descriptor with assigned logical service ownership.
 * @returns Nothing; generated agent functions retain their existing identity exception.
 */
export function validateDomainId(work: NormalizationWork, descriptor: NormalizedDescriptor): void {
  const generated = isRecord(descriptor.value) ? descriptor.value.generated : undefined;
  if (isRecord(generated) && generated.generated === true) return;
  const domain = descriptor.domainId;
  if (domain === undefined) return;
  const valid =
    descriptor.kind === "service"
      ? descriptor.id === domain
      : descriptor.id.startsWith(`${domain}.`);
  if (!valid)
    add(
      work,
      descriptor,
      NORMALIZE_CODES.id,
      descriptor.kind === "service"
        ? `Service ID must equal its domain ID "${domain}".`
        : `Domain descriptor ID must start with "${domain}.".`,
    );
}

/**
 * Resolves public service members without exposing another service's internals.
 * @param work - Invocation-owned diagnostics.
 * @param service - Physical boundary's normalized service descriptor.
 * @param descriptors - Kind-qualified descriptor index preserving ID collisions.
 * @param publicIds - Caller-owned public member set populated on valid references.
 * @returns Nothing; unresolved or cross-owner members produce fatal diagnostics.
 */
export function collectPublicMembers(
  work: NormalizationWork,
  service: NormalizedDescriptor,
  descriptors: ReadonlyMap<string, NormalizedDescriptor>,
  publicIds: Set<string>,
): void {
  const value = isRecord(service.value) ? service.value : {};
  for (const [name, member] of Object.entries(value)) {
    if (
      SERVICE_BASE_FIELDS.has(name) ||
      !["function", "event", "task", "job"].includes(refKind(member) ?? "")
    )
      continue;
    const memberId = refId(member);
    const memberKind = refKind(member);
    const target =
      memberId === undefined || memberKind === undefined
        ? undefined
        : descriptors.get(`${memberKind}:${memberId}`);
    if (target === undefined) {
      add(
        work,
        service,
        NORMALIZE_CODES.missingTarget,
        `Public service member "${name}" does not resolve.`,
      );
    } else if (target.domainId !== service.domainId) {
      add(
        work,
        service,
        NORMALIZE_CODES.domain,
        `Service member "${name}" belongs to another domain.`,
        "error",
        target,
      );
    } else publicIds.add(`${target.kind}:${target.id}`);
  }
}
