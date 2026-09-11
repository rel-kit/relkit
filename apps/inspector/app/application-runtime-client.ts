"use client";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { useEffect, useMemo, useState } from "react";
import { inspectorBackendUrl } from "../lib/client";
import type { ClientIdentityDocument, ThreadList } from "./application-runtime-types";

const agentCapabilityHeaders = {
  "x-relkit-agent-capabilities":
    "relkit.agent-stream.v2,canonical-scoped-events.v1,public-state.v1,cursor-replay.v1,native-checkpoints.v1",
} as const;

type Procedure = (input: unknown, options?: { readonly signal?: AbortSignal }) => Promise<unknown>;

export interface ApplicationRuntimeClient {
  readonly client: ApplicationClient;
  readonly identity?: ClientIdentityDocument;
  readonly status: "loading" | "ready" | "error";
}

export function useApplicationRuntimeClient(): ApplicationRuntimeClient {
  const baseUrl = useMemo(applicationBaseUrl, []);
  const [identity, setIdentity] = useState<ClientIdentityDocument>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(new URL("_relkit/v1/client/identity", baseUrl), {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Application identity failed (${response.status})`);
        const next = (await response.json()) as ClientIdentityDocument;
        if (controller.signal.aborted) return;
        setIdentity((current) => (sameIdentity(current, next) ? current : next));
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    };
    const timer = setInterval(() => void load(), 15_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    void load();
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [baseUrl]);
  const client = useMemo(() => createApplicationClient(baseUrl, identity), [baseUrl, identity]);
  return {
    client,
    ...(identity === undefined ? {} : { identity }),
    status: failed ? "error" : identity === undefined ? "loading" : "ready",
  };
}

export function applicationProcedure(client: ApplicationClient, name: string): Procedure {
  const procedure = (client as unknown as Readonly<Record<string, unknown>>)[name];
  if (typeof procedure !== "function") throw new Error(`Application procedure ${name} is missing.`);
  return procedure as Procedure;
}

export function listAgentThreads(
  runtime: ApplicationRuntimeClient,
  agentId: string,
): Promise<ThreadList> {
  if (runtime.status !== "ready" || runtime.identity === undefined)
    return Promise.reject(new Error("Application runtime is not ready."));
  return applicationProcedure(
    runtime.client,
    "relkit.agent.threads",
  )({
    agentId,
    expectedIdentity: runtime.identity,
  }) as Promise<ThreadList>;
}

type ApplicationClient = ReturnType<typeof createORPCClient>;

function createApplicationClient(
  baseUrl: string,
  identity: ClientIdentityDocument | undefined,
): ApplicationClient {
  const endpoint = new URL("rpc", baseUrl);
  return createORPCClient(
    new RPCLink({
      origin: endpoint.origin,
      url: endpoint.pathname as `/${string}`,
      headers:
        identity === undefined
          ? agentCapabilityHeaders
          : {
              ...agentCapabilityHeaders,
              "x-relkit-identity-scope": identity.identityScope,
              "x-relkit-session-epoch": identity.sessionEpoch,
              ...(browserCookie("relkit_csrf") === undefined
                ? {}
                : { "x-relkit-csrf": browserCookie("relkit_csrf")! }),
            },
      fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
    }),
  );
}

function browserCookie(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return value === undefined ? undefined : decodeURIComponent(value.slice(prefix.length));
}

function sameIdentity(
  current: ClientIdentityDocument | undefined,
  next: ClientIdentityDocument,
): boolean {
  return (
    current?.applicationId === next.applicationId &&
    current.identityScope === next.identityScope &&
    current.sessionEpoch === next.sessionEpoch &&
    current.publicFingerprint === next.publicFingerprint
  );
}

function applicationBaseUrl(): string {
  const base = inspectorBackendUrl().replace(/\/$/, "");
  return new URL(`${base}/`, window.location.href).href;
}
