"use client";

import { RelkitClientProvider, useRelkitClient } from "@relkit/client/react";
import { useState, type ReactNode } from "react";
import { agentTransports, type AgentTransport } from "./agent-example-config";

const baseUrl = process.env.NEXT_PUBLIC_RELKIT_BASE_URL ?? "http://127.0.0.1:4000";

export function Providers({ children }: { readonly children: ReactNode }) {
  const [transport, setTransport] = useState<AgentTransport>("sse");
  return (
    <>
      <label>
        Agent stream transport
        <select
          value={transport}
          onChange={(event) => setTransport(event.target.value as AgentTransport)}
        >
          {agentTransports.map((value) => (
            <option key={value} value={value}>
              {value.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <RelkitClientProvider
        key={transport}
        baseUrl={baseUrl}
        headers={{ authorization: "Bearer commerce-demo" }}
        transport={transport}
      >
        <ClientStatus />
        {children}
      </RelkitClientProvider>
    </>
  );
}

function ClientStatus() {
  const { status } = useRelkitClient();
  if (status === "ready" || status === "loading") return null;
  return (
    <p role="alert">
      {status === "application-updated"
        ? "The RelKit backend now serves a different contract than this build. Rebuild the frontend to load its typed client."
        : "The RelKit API is unavailable. Check that the backend is running."}
    </p>
  );
}
