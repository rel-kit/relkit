import { createHash } from "node:crypto";
import { os, type AnyProcedure } from "@orpc/server";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import type { PresenceSnapshot } from "@relkit/realtime";
import { assertExpectedIdentity } from "./rpc-identity.js";
import type { RpcContext } from "./rpc.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import {
  channelContext,
  type SubscribeInput,
  validatePublicValue,
} from "./realtime-rpc-support.js";

export function realtimeProcedures(
  options: RouteMaterializationOptions,
): Readonly<Record<string, AnyProcedure>> {
  if (options.realtime === undefined || options.clientIdentity === undefined) return {};
  return {
    "relkit.realtime.subscribe": os
      .$context<RpcContext>()
      .handler(({ input, context, signal }) =>
        observe(input as SubscribeInput, context, options, signal),
      ),
    "relkit.realtime.presence": os.$context<RpcContext>().handler(async ({ input, context }) => {
      await assertExpectedIdentity(context, options.clientIdentity!);
      const resolved = await channelContext(input as SubscribeInput, context, options);
      if (resolved.descriptor.presence === undefined) throw new Error("Presence is not enabled.");
      return resolved.provider.readPresence({
        ...resolved.scope,
        maxMembers: memberLimit(resolved.descriptor.presence),
      });
    }),
  };
}

async function* observe(
  input: SubscribeInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  signal: AbortSignal | undefined,
) {
  await assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity);
  let resolved = await channelContext(input, context, options);
  const presenceOwner = resolved;
  let after = resolved.descriptor.replay === undefined ? undefined : input.after;
  let presenceRenewedAt = 0;
  if (input.after !== undefined && resolved.descriptor.replay === undefined) {
    const fence = await resolved.provider.readAfter({
      ...resolved.scope,
      limit: 1,
      maxEncodedBytes: 64 * 1024,
    });
    yield { kind: "gap", reason: "replay-disabled", checkpoint: fence.checkpoint };
    after = fence.checkpoint;
  }
  const controller = signal ?? new AbortController().signal;
  const leaseId = crypto.randomUUID();
  try {
    if (resolved.descriptor.presence !== undefined) {
      yield { kind: "presence", presence: await acquirePresence(resolved, leaseId) };
      presenceRenewedAt = Date.now();
    }
    while (!controller.aborted) {
      await assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity);
      resolved = await channelContext(
        after === undefined
          ? { channel: input.channel, params: input.params }
          : { ...input, after },
        context,
        options,
      );
      const page = await resolved.provider.readAfter({
        ...resolved.scope,
        ...(after === undefined ? {} : { after }),
        limit: 100,
        maxEncodedBytes: 1024 * 1024,
      });
      if (page.gap !== undefined)
        yield { kind: "gap", reason: page.gap, checkpoint: page.checkpoint };
      for (const record of page.events) {
        await assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity);
        resolved = await channelContext({ ...input, after: record.checkpoint }, context, options);
        const schema = resolved.descriptor.events[record.event];
        if (schema === undefined) continue;
        const payload = await validatePublicValue(schema, record.payload);
        yield { kind: "event", event: record.event, payload, checkpoint: record.checkpoint };
      }
      after = page.checkpoint;
      if (resolved.descriptor.presence !== undefined && Date.now() - presenceRenewedAt >= 15_000) {
        yield { kind: "presence", presence: await renewPresence(resolved, leaseId) };
        presenceRenewedAt = Date.now();
      }
      if (!page.hasMore) {
        yield { kind: "caught-up", checkpoint: after };
        await resolved.provider.waitAfter({
          ...resolved.scope,
          after,
          deadlineMs: Date.now() + 15_000,
          signal: controller,
        });
      }
    }
  } finally {
    if (presenceOwner.descriptor.presence !== undefined) {
      await presenceOwner.provider
        .releasePresence({
          ...presenceOwner.scope,
          leaseId,
          connectionId: leaseId,
          maxMembers: memberLimit(presenceOwner.descriptor.presence),
          maxConnections: REALTIME_RUNTIME_LIMITS.liveConnections,
        })
        .catch(() => undefined);
    }
  }
}

async function acquirePresence(
  resolved: Awaited<ReturnType<typeof channelContext>>,
  leaseId: string,
): Promise<PresenceSnapshot> {
  const presence = resolved.descriptor.presence!;
  const member =
    typeof presence === "object"
      ? await validatePublicValue(
          presence.member,
          await presence.resolve(resolved.params, resolved.trusted),
        )
      : undefined;
  return resolved.provider.acquirePresence({
    ...resolved.scope,
    leaseId,
    connectionId: leaseId,
    expiresAt: new Date(Date.now() + 45_000).toISOString(),
    maxMembers: memberLimit(presence),
    maxConnections: REALTIME_RUNTIME_LIMITS.liveConnections,
    ...(member === undefined
      ? {}
      : { opaqueMemberId: memberId(resolved.scope), memberInfo: member }),
  });
}

async function renewPresence(
  resolved: Awaited<ReturnType<typeof channelContext>>,
  leaseId: string,
): Promise<PresenceSnapshot> {
  return resolved.provider.renewPresence({
    ...resolved.scope,
    leaseId,
    connectionId: leaseId,
    expiresAt: new Date(Date.now() + 45_000).toISOString(),
    maxMembers: memberLimit(resolved.descriptor.presence!),
    maxConnections: REALTIME_RUNTIME_LIMITS.liveConnections,
  });
}

function memberId(scope: Awaited<ReturnType<typeof channelContext>>["scope"]): string {
  return createHash("sha256")
    .update(`${scope.channelId}:${scope.partition}:${scope.identityScope}`)
    .digest("hex");
}

function memberLimit(
  presence: NonNullable<Awaited<ReturnType<typeof channelContext>>["descriptor"]["presence"]>,
): number {
  return typeof presence === "object" ? presence.maxMembers : 1_000;
}
