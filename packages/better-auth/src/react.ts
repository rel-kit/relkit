"use client";

import { RelkitClientProvider } from "@relkit/client/react";
import { createElement, type ReactNode } from "react";
import type { BetterAuthRelkitClientProviderProps } from "./react.types.js";
export type { BetterAuthClientLike, BetterAuthRelkitClientProviderProps } from "./react.types.js";

/**
 * Remounts the RELKIT client whenever native authentication identity changes.
 * @typeParam Session - Session type inferred from the browser auth client.
 * @param props - Provider settings and a native useSession hook.
 * @returns React provider with pending authentication gated by a null identity.
 * @remarks Session id, update time and user id establish remount identity; errors
 * remain owned by the native hook. This browser entrypoint uses only client dependencies.
 * @example
 * ```ts
 * import { createElement } from "react";
 * import { createAuthClient } from "better-auth/react";
 * import { BetterAuthRelkitClientProvider } from "@relkit/better-auth/react";
 * const authClient = createAuthClient();
 * const provider = createElement(BetterAuthRelkitClientProvider, { authClient, children: null });
 * ```
 */
export function BetterAuthRelkitClientProvider<Session>(
  props: BetterAuthRelkitClientProviderProps<Session>,
): ReactNode {
  const { authClient, identityKey, ...providerProps } = props;
  const session = authClient.useSession();
  const key = session.isPending ? "pending" : sessionKey(session.data);
  return createElement(RelkitClientProvider, {
    ...providerProps,
    key,
    ...(session.isPending
      ? { identityKey: null }
      : identityKey === undefined
        ? {}
        : { identityKey }),
  });
}

/**
 * Derives React remount identity from the SDK's session/user fields.
 * @param value - Native session result, including absent/anonymous results.
 * @returns Stable identity key; native values remain opaque outside known fields.
 */
function sessionKey(value: unknown): string {
  if (value === null || value === undefined) return "anonymous";
  const session = record(record(value)?.session);
  const user = record(record(value)?.user);
  return [session?.id, session?.updatedAt, user?.id].map(String).join(":");
}

/**
 * Narrows opaque SDK records without coercing or serializing session values.
 * @param value - Candidate session or nested record.
 * @returns Record view when value is an object, otherwise undefined.
 */
function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
