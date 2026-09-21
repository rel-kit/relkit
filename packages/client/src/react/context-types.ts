import type { ClientIdentityDocument } from "@relkit/contracts";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ClientHeaders, createClient } from "../index.js";
import type { RelkitKeyScope } from "./keys.js";
import type { RealtimeManager } from "./realtime-manager.js";

export interface RelkitHydrationState {
  readonly scope: RelkitKeyScope;
  readonly dehydrated: unknown;
}

export interface RelkitClientProviderProps {
  readonly baseUrl?: string;
  readonly environment?: string;
  readonly credentials?: RequestInit["credentials"];
  readonly headers?: ClientHeaders;
  readonly queryClient?: QueryClient;
  readonly identityKey?: string | null;
  readonly hydratedState?: RelkitHydrationState;
  readonly transport?: "auto" | "websocket" | "http-stream" | "sse";
  readonly requestTimeoutMs?: number;
  readonly streamEstablishmentTimeoutMs?: number;
  readonly children: ReactNode;
}

export interface RelkitClientRuntime {
  readonly client: ReturnType<typeof createClient>;
  readonly streamClient: ReturnType<typeof createClient>;
  readonly queryClient: QueryClient;
  readonly utils: unknown;
  readonly identity?: ClientIdentityDocument;
  readonly identityKey?: string | null;
  readonly status: "loading" | "ready" | "application-updated" | "error";
  readonly scope?: RelkitKeyScope;
  readonly transport: "auto" | "websocket" | "http-stream" | "sse";
  readonly streamEstablishmentTimeoutMs: number;
  readonly environment?: string;
  readonly realtime: RealtimeManager;
}
