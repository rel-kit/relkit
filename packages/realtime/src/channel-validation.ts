import { normalizeId } from "@relkit/contracts";
import { validate, type StandardSchemaV1 } from "@relkit/schema";
import type {
  ChannelClientPolicy,
  ChannelGuard,
  ChannelPresence,
  ChannelReplay,
  MemberPresenceDescriptor,
} from "./channel.js";

export function copyChannelClient(value: unknown): ChannelClientPolicy<ChannelGuard> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Channel client policy must be an object");
  const keys = Reflect.ownKeys(value);
  if (value.public === true && value.authorize === undefined && keys.length === 1) {
    return { public: true };
  }
  if (typeof value.authorize === "function" && value.public === undefined && keys.length === 1) {
    return { authorize: value.authorize as ChannelGuard };
  }
  throw new TypeError("Channel client policy must be public or authorize, exclusively");
}

export function copyChannelPresence(
  value: unknown,
  client: ChannelClientPolicy<ChannelGuard> | undefined,
): ChannelPresence | undefined {
  if (value === undefined || value === "count") return value;
  if (!isRecord(value) || !isChannelSchema(value.member) || typeof value.resolve !== "function") {
    throw new TypeError("Member presence requires member, resolve, and maxMembers");
  }
  if (client === undefined || "public" in client) {
    throw new TypeError("Member presence requires a protected channel");
  }
  return {
    member: value.member,
    resolve: value.resolve as MemberPresenceDescriptor["resolve"],
    maxMembers: positive(value.maxMembers, "presence.maxMembers"),
  };
}

export function copyChannelEvents(value: unknown): Readonly<Record<string, StandardSchemaV1>> {
  if (!isRecord(value)) throw new TypeError("Channel events must be an object");
  const result: Record<string, StandardSchemaV1> = {};
  for (const [name, schema] of Object.entries(value)) {
    const event = normalizeId(name);
    assertChannelSchema(schema, `event ${event}`);
    result[event] = schema;
  }
  return Object.freeze(result);
}

export function copyChannelReplay(value: unknown): ChannelReplay | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Channel replay must be an object");
  return {
    retentionMs: positive(value.retentionMs, "replay.retentionMs"),
    maxEvents: positive(value.maxEvents, "replay.maxEvents"),
  };
}

export function assertChannelSchema(
  value: unknown,
  name: string,
): asserts value is StandardSchemaV1 {
  if (!isChannelSchema(value)) {
    throw new TypeError(`Channel ${name} must be a Standard Schema v1 validator`);
  }
}

export function isChannelSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

export async function validateChannelValue(
  schema: StandardSchemaV1,
  value: unknown,
  name: string,
): Promise<unknown> {
  const result = await validate(schema, value as never);
  if (!("value" in result)) throw new TypeError(`Channel ${name} validation failed`);
  return result.value;
}

export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positive(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value as number;
}
