"use client";

import type { ClientIdentityDocument } from "@relkit/contracts";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import {
  hydrate,
  QueryClient,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "../index.js";
import { clearPendingOperations, pendingScopeKey } from "./pending.js";
import { RealtimeManager } from "./realtime-manager.js";
import {
  browserOrigin,
  compiledFingerprint,
  finiteFetcher,
  identityHeaders,
  isRelkitQuery,
  loadIdentity,
  sameScope,
  scopeFor,
  streamClientFor,
} from "./context-support.js";
import type { RelkitClientProviderProps, RelkitClientRuntime } from "./context-types.js";
export type {
  RelkitClientProviderProps,
  RelkitClientRuntime,
  RelkitHydrationState,
} from "./context-types.js";
const Context = createContext<RelkitClientRuntime | undefined>(undefined);

export function RelkitClientProvider(props: RelkitClientProviderProps): ReactNode {
  const baseUrl = props.baseUrl ?? browserOrigin();
  const [queryClient] = useState(() => props.queryClient ?? new QueryClient());
  const [identity, setIdentity] = useState<ClientIdentityDocument>();
  const [failed, setFailed] = useState(false);
  const previous = useRef<string | undefined>(undefined);
  const previousPendingScope = useRef<string | undefined>(undefined);
  const fetcher = useMemo(
    () => finiteFetcher(props.requestTimeoutMs ?? 30_000),
    [props.requestTimeoutMs],
  );
  const client = useMemo(
    () =>
      createClient({
        baseUrl,
        credentials: props.credentials ?? "include",
        headers: async () => identityHeaders(props.headers, identity),
        fetch: fetcher,
      }),
    [baseUrl, props.credentials, props.headers, fetcher, identity],
  );
  const streamClient = useMemo(
    () =>
      streamClientFor({
        baseUrl,
        credentials: props.credentials ?? "include",
        headers: props.headers,
        transport: props.transport,
        timeoutMs: props.streamEstablishmentTimeoutMs ?? 10_000,
        identity,
      }),
    [
      baseUrl,
      props.credentials,
      props.headers,
      props.streamEstablishmentTimeoutMs,
      props.transport,
      identity,
    ],
  );
  const utils = useMemo(() => createTanstackQueryUtils(client), [client]);
  const realtime = useMemo(
    () => new RealtimeManager(streamClient, identity),
    [streamClient, identity],
  );

  useEffect(() => () => realtime.dispose(), [realtime]);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void loadIdentity(baseUrl, props.credentials ?? "include", controller.signal)
      .then((next) => {
        const key = `${next.identityScope}:${next.sessionEpoch}:${props.environment ?? ""}`;
        if (previous.current !== undefined && previous.current !== key) {
          void queryClient.cancelQueries({ predicate: isRelkitQuery });
          queryClient.removeQueries({ predicate: isRelkitQuery });
          if (previousPendingScope.current !== undefined) {
            clearPendingOperations(previousPendingScope.current);
          }
        }
        previous.current = key;
        const hydration = props.hydratedState;
        const nextScope = scopeFor(baseUrl, next, props.identityKey, props.environment);
        previousPendingScope.current = pendingScopeKey(nextScope);
        if (hydration !== undefined && sameScope(hydration.scope, nextScope)) {
          hydrate(queryClient, hydration.dehydrated as DehydratedState);
        }
        setIdentity(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed(true);
        void error;
      });
    return () => controller.abort();
  }, [
    baseUrl,
    props.credentials,
    props.environment,
    props.hydratedState,
    props.identityKey,
    queryClient,
  ]);
  const compiled = compiledFingerprint();
  const status = failed
    ? "error"
    : identity === undefined
      ? "loading"
      : compiled !== undefined && compiled !== identity.publicFingerprint
        ? "application-updated"
        : "ready";
  const scope = useMemo(
    () =>
      identity === undefined
        ? undefined
        : scopeFor(baseUrl, identity, props.identityKey, props.environment),
    [baseUrl, identity, props.identityKey, props.environment],
  );
  const runtime = useMemo<RelkitClientRuntime>(
    () => ({
      client,
      streamClient,
      queryClient,
      utils,
      ...(identity === undefined ? {} : { identity }),
      ...(props.identityKey === undefined ? {} : { identityKey: props.identityKey }),
      status,
      ...(scope === undefined ? {} : { scope }),
      ...(props.environment === undefined ? {} : { environment: props.environment }),
      transport: props.transport ?? "auto",
      streamEstablishmentTimeoutMs: props.streamEstablishmentTimeoutMs ?? 10_000,
      realtime,
    }),
    [
      client,
      streamClient,
      queryClient,
      utils,
      identity,
      props.identityKey,
      props.transport,
      props.streamEstablishmentTimeoutMs,
      status,
      scope,
      props.environment,
      realtime,
    ],
  );
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(Context.Provider, { value: runtime }, props.children),
  );
}

export function useRelkitClient(): RelkitClientRuntime {
  const value = useContext(Context);
  if (value === undefined) throw new Error("useRelkitClient requires RelkitClientProvider");
  return value;
}
