import { normalizeId } from "@zsys/contracts";
import type * as pulumi from "@pulumi/pulumi";
import type { ZsysCacheDefinition, ZsysCachesArgs } from "./types.js";

export interface NormalizedCache {
  readonly id: string;
  readonly engineVersion?: ZsysCacheDefinition["engineVersion"];
  readonly maxDataStorageGb?: ZsysCacheDefinition["maxDataStorageGb"];
  readonly maxEcpuPerSecond?: ZsysCacheDefinition["maxEcpuPerSecond"];
  readonly subnetIds?: ZsysCacheDefinition["subnetIds"];
  readonly securityGroupIds?: ZsysCacheDefinition["securityGroupIds"];
}

export function normalizeCaches(args: ZsysCachesArgs): readonly NormalizedCache[] {
  const ids = new Set<string>();
  return args.caches.map((definition) => {
    const id = normalizeId(definition.id);
    if (!ids.add(id)) throw new TypeError(`Duplicate AWS cache "${id}".`);
    validateLimit(definition.maxDataStorageGb, id, "maxDataStorageGb", 1, 5_000);
    validateLimit(definition.maxEcpuPerSecond, id, "maxEcpuPerSecond", 1_000, 15_000_000);
    return {
      id,
      ...(definition.engineVersion === undefined
        ? {}
        : { engineVersion: definition.engineVersion }),
      ...(definition.maxDataStorageGb === undefined
        ? {}
        : { maxDataStorageGb: definition.maxDataStorageGb }),
      ...(definition.maxEcpuPerSecond === undefined
        ? {}
        : { maxEcpuPerSecond: definition.maxEcpuPerSecond }),
      ...(definition.subnetIds === undefined ? {} : { subnetIds: definition.subnetIds }),
      ...(definition.securityGroupIds === undefined
        ? {}
        : { securityGroupIds: definition.securityGroupIds }),
    };
  });
}

function validateLimit(
  value: pulumi.Input<number> | undefined,
  id: string,
  name: string,
  minimum: number,
  maximum: number,
): void {
  if (value === undefined || typeof value !== "number") return;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError(
      `AWS cache "${id}" ${name} must be an integer between ${minimum} and ${maximum}.`,
    );
}
