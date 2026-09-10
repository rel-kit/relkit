"use client";

import { RelkitClientProvider, type RelkitClientProviderProps } from "@relkit/client/react";
import { createElement, type ReactNode } from "react";

export interface BetterAuthClientLike<Session> {
  useSession(): {
    readonly data: Session | null | undefined;
    readonly isPending: boolean;
    readonly error?: unknown;
  };
}

export interface BetterAuthRelkitClientProviderProps<Session> extends RelkitClientProviderProps {
  readonly authClient: BetterAuthClientLike<Session>;
}

export function BetterAuthRelkitClientProvider<Session>({
  authClient,
  identityKey,
  ...props
}: BetterAuthRelkitClientProviderProps<Session>): ReactNode {
  const session = authClient.useSession();
  const key = session.isPending ? "pending" : sessionKey(session.data);
  return createElement(RelkitClientProvider, {
    ...props,
    key,
    ...(session.isPending
      ? { identityKey: null }
      : identityKey === undefined
        ? {}
        : { identityKey }),
  });
}

function sessionKey(value: unknown): string {
  if (value === null || value === undefined) return "anonymous";
  const session = record(record(value)?.session);
  const user = record(record(value)?.user);
  return [session?.id, session?.updatedAt, user?.id].map(String).join(":");
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
