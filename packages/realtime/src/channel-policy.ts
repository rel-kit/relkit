import { Effect } from "effect";
import type {
  ChannelClientPolicy,
  ChannelGuard,
  ChannelPresence,
  ChannelReplay,
  MemberPresenceDescriptor,
} from "./channel.types.js";
import {
  isChannelSchemaEffect,
  isRecordEffect,
  runChannelValidation,
} from "./channel-validation.js";
import { ChannelValidationError } from "./realtime-errors.js";
import { observeRealtime } from "./realtime-observability.js";
/** Copies an authored client policy into a descriptor value.
 * @param value - Candidate policy.
 * @returns An Effect of the policy or ChannelValidationError.
 * @example Effect.runSync(copyChannelClientEffect({ public: true }));
 */
export const copyChannelClientEffect = Effect.fn("Realtime.copyChannelClient")(
  function* (value: unknown) {
    if (value === undefined) return undefined;
    if (!(yield* isRecordEffect(value)))
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.copyClient",
          reason: "Channel client policy must be an object",
        }),
      );
    const candidate = value as Record<PropertyKey, unknown>;
    const keys = Reflect.ownKeys(candidate);
    if (candidate.public === true && candidate.authorize === undefined && keys.length === 1)
      return { public: true as const };
    if (
      typeof candidate.authorize === "function" &&
      candidate.public === undefined &&
      keys.length === 1
    )
      return { authorize: candidate.authorize as ChannelGuard };
    return yield* Effect.fail(
      new ChannelValidationError({
        operation: "channel.copyClient",
        reason: "Channel client policy must be public or authorize, exclusively",
      }),
    );
  },
  (effect) => observeRealtime("channel.copyClient", effect),
);
/** Copies a client policy.
 * @param value - Candidate policy.
 * @returns The copied policy or undefined.
 * @throws TypeError for a malformed policy.
 * @example copyChannelClient({ public: true });
 */
export function copyChannelClient(value: unknown): ChannelClientPolicy<ChannelGuard> | undefined {
  return runChannelValidation(copyChannelClientEffect(value));
}
/** Validates a positive integer used by channel policies. */
function positive(value: unknown, name: string, operation: string) {
  return Number.isSafeInteger(value) && (value as number) >= 1
    ? Effect.succeed(value as number)
    : Effect.fail(
        new ChannelValidationError({ operation, reason: `${name} must be a positive integer` }),
      );
}
/** Copies presence and checks member authorization.
 * @param value - Candidate presence.
 * @param client - Validated client policy.
 * @returns An Effect of presence or ChannelValidationError.
 * @example Effect.runSync(copyChannelPresenceEffect("count", undefined));
 */
export const copyChannelPresenceEffect = Effect.fn("Realtime.copyChannelPresence")(
  function* (value: unknown, client: ChannelClientPolicy<ChannelGuard> | undefined) {
    if (value === undefined) return undefined;
    if (value === "count") return "count" as const;
    const candidate = value as Record<PropertyKey, unknown>;
    if (
      !(yield* isRecordEffect(value)) ||
      !(yield* isChannelSchemaEffect(candidate.member)) ||
      typeof candidate.resolve !== "function"
    )
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.copyPresence",
          reason: "Member presence requires member, resolve, and maxMembers",
        }),
      );
    if (client === undefined || "public" in client)
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.copyPresence",
          reason: "Member presence requires a protected channel",
        }),
      );
    const maxMembers = yield* positive(
      candidate.maxMembers,
      "presence.maxMembers",
      "channel.copyPresence",
    );
    return {
      member: candidate.member as MemberPresenceDescriptor["member"],
      resolve: candidate.resolve as MemberPresenceDescriptor["resolve"],
      maxMembers,
    };
  },
  (effect) => observeRealtime("channel.copyPresence", effect),
);
/** Copies a presence policy.
 * @param value - Candidate presence.
 * @param client - Validated client policy.
 * @returns The copied presence or undefined.
 * @throws TypeError for malformed or unprotected member presence.
 * @example copyChannelPresence("count", undefined);
 */
export function copyChannelPresence(
  value: unknown,
  client: ChannelClientPolicy<ChannelGuard> | undefined,
): ChannelPresence | undefined {
  return runChannelValidation(copyChannelPresenceEffect(value, client));
}
/** Copies replay limits into a descriptor value.
 * @param value - Candidate replay limits.
 * @returns An Effect of replay limits or ChannelValidationError.
 * @example Effect.runSync(copyChannelReplayEffect({ retentionMs: 100, maxEvents: 10 }));
 */
export const copyChannelReplayEffect = Effect.fn("Realtime.copyChannelReplay")(
  function* (value: unknown) {
    if (value === undefined) return undefined;
    if (!(yield* isRecordEffect(value)))
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.copyReplay",
          reason: "Channel replay must be an object",
        }),
      );
    const candidate = value as Record<PropertyKey, unknown>;
    return {
      retentionMs: yield* positive(
        candidate.retentionMs,
        "replay.retentionMs",
        "channel.copyReplay",
      ),
      maxEvents: yield* positive(candidate.maxEvents, "replay.maxEvents", "channel.copyReplay"),
    };
  },
  (effect) => observeRealtime("channel.copyReplay", effect),
);
/** Copies replay limits.
 * @param value - Candidate replay limits.
 * @returns The copied limits or undefined.
 * @throws TypeError for invalid limits.
 * @example copyChannelReplay({ retentionMs: 100, maxEvents: 10 });
 */
export function copyChannelReplay(value: unknown): ChannelReplay | undefined {
  return runChannelValidation(copyChannelReplayEffect(value));
}
