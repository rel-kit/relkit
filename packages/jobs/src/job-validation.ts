import type { MaybePromise } from "@relkit/contracts";
import type { JobAccessGrant, JobAccessRequest, JobClientOperation } from "@relkit/contracts/jobs";
import { duration } from "./task-validation.js";
import type { JobAdmission, JobClientAccess, JobClientField } from "./job-types.js";
import { assertCanonicalScalarKey, assertFieldName } from "./task-policy-validation.js";
import type { StandardSchemaV1 } from "@relkit/schema";

const OPERATIONS: readonly JobClientOperation[] = [
  "trigger",
  "get",
  "list",
  "watch",
  "cancel",
  "retry",
  "stream",
];
const FIELDS: readonly JobClientField[] = ["status", "input", "progress", "output", "error"];

export function copyAdmission<Input>(
  value: unknown,
  canonicalSchema?: StandardSchemaV1,
): JobAdmission<Input> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Job admission must be an object");
  if (value.pastAt !== undefined && value.pastAt !== "run" && value.pastAt !== "reject") {
    throw new TypeError('admission.pastAt must be "run" or "reject"');
  }
  let idempotency: Record<string, unknown> | undefined;
  if (value.idempotency !== undefined) {
    if (!isRecord(value.idempotency))
      throw new TypeError("admission.idempotency must be an object");
    if (
      value.idempotency.key !== undefined &&
      (typeof value.idempotency.key !== "string" || value.idempotency.key.length === 0)
    ) {
      throw new TypeError("admission.idempotency.key must be a non-empty string");
    }
    if (value.idempotency.key !== undefined) {
      assertFieldName(value.idempotency.key, "admission.idempotency.key");
      if (canonicalSchema !== undefined) {
        assertCanonicalScalarKey(
          canonicalSchema,
          value.idempotency.key,
          "admission.idempotency.key",
        );
      }
    }
    idempotency = {
      ...(value.idempotency.key === undefined ? {} : { key: value.idempotency.key }),
      ...(value.idempotency.retention === undefined
        ? {}
        : {
            retention: duration(
              value.idempotency.retention,
              "admission.idempotency.retention",
              true,
            ),
          }),
    };
  }
  return Object.freeze({
    ...(value.pastAt === undefined ? {} : { pastAt: value.pastAt }),
    ...(idempotency === undefined ? {} : { idempotency: Object.freeze(idempotency) }),
  }) as JobAdmission<Input>;
}

export interface ClientDeclarations {
  readonly progress?: unknown;
  readonly streams?: unknown;
}

export function copyClient(
  value: unknown,
  declarations: ClientDeclarations,
): JobClientAccess | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Job client access must be an object");
  if (!Array.isArray(value.operations) || value.operations.length === 0) {
    throw new TypeError("client.operations must be non-empty");
  }
  if (
    value.operations.some(
      (operation) =>
        typeof operation !== "string" || !OPERATIONS.includes(operation as JobClientOperation),
    ) ||
    new Set(value.operations).size !== value.operations.length
  ) {
    throw new TypeError("client.operations contains an invalid or duplicate operation");
  }
  const fields = value.fields;
  if (
    fields !== undefined &&
    (!Array.isArray(fields) ||
      fields.some((field) => !FIELDS.includes(field as JobClientField)) ||
      new Set(fields).size !== fields.length)
  ) {
    throw new TypeError("client.fields contains an invalid field");
  }
  if (Array.isArray(fields) && fields.includes("progress") && declarations.progress === undefined) {
    throw new TypeError("client.fields.progress requires a declared task progress schema");
  }
  const operations = value.operations as readonly unknown[];
  const hasStreamOperation = operations.includes("stream");
  const declaredStreams = isRecord(declarations.streams) ? Object.keys(declarations.streams) : [];
  const hasDeclaredStreams = declaredStreams.length > 0;
  if (value.streams !== undefined) {
    if (!Array.isArray(value.streams) || !hasDeclaredStreams) {
      throw new TypeError("client.streams requires declared task streams");
    }
    if (!hasStreamOperation) throw new TypeError("client.streams requires the stream operation");
    if (new Set(value.streams).size !== value.streams.length) {
      throw new TypeError("client.streams must be unique");
    }
    for (const stream of value.streams) {
      if (
        typeof stream !== "string" ||
        !isRecord(declarations.streams) ||
        !Object.hasOwn(declarations.streams, stream)
      ) {
        throw new TypeError(`client.streams contains undeclared stream "${String(stream)}"`);
      }
    }
  } else if (hasStreamOperation && !hasDeclaredStreams) {
    throw new TypeError("client.operations.stream requires declared task streams");
  }
  const publicAccess = value.public === true;
  const authorize = value.authorize;
  if (publicAccess === (typeof authorize === "function")) {
    throw new TypeError("Job client access must choose public or authorize");
  }
  if (value.public !== undefined && value.public !== true)
    throw new TypeError("client.public must be true");
  const result = {
    ...(publicAccess
      ? { public: true as const }
      : { authorize: authorize as (request: JobAccessRequest) => MaybePromise<JobAccessGrant> }),
    operations: Object.freeze([...operations]) as readonly JobClientOperation[],
    ...(fields === undefined
      ? {}
      : { fields: Object.freeze([...fields]) as readonly JobClientField[] }),
    ...(value.streams === undefined
      ? {}
      : { streams: Object.freeze([...value.streams]) as readonly string[] }),
  };
  return Object.freeze(result) as JobClientAccess;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
