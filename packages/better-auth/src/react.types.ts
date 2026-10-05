import type { RelkitClientProviderProps } from "@relkit/client/react";

/**
 * Browser SDK hook contract retaining the native inferred session type.
 * @typeParam Session - Native client session and user result.
 */
export interface BetterAuthClientLike<Session> {
  /**
   * Reads reactive authentication state; hook ownership stays with React.
   * @returns Native session data, loading state and optional SDK error.
   */
  useSession(): {
    readonly data: Session | null | undefined;
    readonly isPending: boolean;
    readonly error?: unknown;
  };
}

/**
 * Client provider props with a native auth hook; no server runtime dependency.
 * @typeParam Session - Session result passed through the browser client hook.
 */
export interface BetterAuthRelkitClientProviderProps<Session> extends RelkitClientProviderProps {
  readonly authClient: BetterAuthClientLike<Session>;
}
