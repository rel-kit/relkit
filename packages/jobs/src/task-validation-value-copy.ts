import { isErrorDescriptor } from "@relkit/functions";
import { isRef } from "@relkit/contracts";
import type { ErrorDescriptorAny } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import { assertJobName } from "./job-name.js";
import type { TaskDependencies, TaskStreamSchemas } from "./task-types.js";
import { assertSchema } from "./task-validation-value.js";

/** Copies declared task dependencies by supported kind and stable name.
 * @param value - Candidate dependency maps.
 * @returns Frozen dependency maps or undefined when absent.
 * @throws TypeError for unsupported kinds or invalid references.
 * @example copyDependencies({ jobs: { send: jobRef } });
 */
export function copyDependencies<Dependencies extends TaskDependencies>(
  value: unknown,
): Dependencies | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Task dependencies must be an object");
  if (hasOwn(value, "functions") || hasOwn(value, "events")) {
    throw new TypeError("Task dependencies support tasks, jobs, agents, buckets, and cache only");
  }
  const kinds = {
    tasks: "task",
    jobs: "job",
    agents: "agent",
    buckets: "bucket",
    cache: "cache",
  } as const;
  if (Object.keys(value).some((category) => !(category in kinds))) {
    throw new TypeError("Task dependencies contain an unsupported category");
  }
  const result: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [category, kind] of Object.entries(kinds)) {
    const map = value[category];
    if (map === undefined) continue;
    if (!isRecord(map)) throw new TypeError(`Task dependency map "${category}" must be an object`);
    const copied: Record<string, unknown> = {};
    for (const [name, target] of Object.entries(map)) {
      assertJobName(name, `task ${category} dependency name`);
      if (!isRecord(target) || !isRef(target.ref, kind)) {
        throw new TypeError(`Invalid ${category} dependency "${name}"`);
      }
      copied[name] = target;
    }
    result[category] = Object.freeze(copied);
  }
  return Object.freeze(result) as unknown as Dependencies;
}
/** Copies unique declared task error descriptors.
 * @param value - Candidate error list.
 * @returns Frozen descriptors or undefined when absent.
 * @throws TypeError for invalid descriptors or duplicate IDs.
 * @example copyErrors([notFoundError]);
 */
export function copyErrors(value: unknown): readonly ErrorDescriptorAny[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => !isErrorDescriptor(entry))) {
    throw new TypeError("Task errors must be declared error descriptors");
  }
  if (new Set(value.map((entry) => entry.id)).size !== value.length) {
    throw new TypeError("Task errors must have unique IDs");
  }
  return Object.freeze([...value]) as readonly ErrorDescriptorAny[];
}
/** Copies named task streams with Standard Schema validators.
 * @param value - Candidate stream schema map.
 * @returns Frozen stream schemas or undefined when absent.
 * @throws TypeError for invalid stream names or validators.
 * @example copyStreams({ events: eventSchema });
 */
export function copyStreams(value: unknown): TaskStreamSchemas | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Task streams must be an object");
  const result: Record<string, StandardSchemaV1> = {};
  for (const [name, schema] of Object.entries(value)) {
    assertJobName(name, "task stream name");
    assertSchema(schema, `task stream "${name}"`);
    result[name] = schema;
  }
  return Object.freeze(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
