"use client";

import { RelkitClientProvider } from "@relkit/client/react";
import { useState, type ReactNode } from "react";
import { agentTransports, type AgentTransport } from "./agent-config";

export function Providers({ children }: { readonly children: ReactNode }) {
  const [transport, setTransport] = useState<AgentTransport>("sse");
  return (
    <>
      <label>
        Agent transport
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
      <RelkitClientProvider key={transport} baseUrl="http://127.0.0.1:3000" transport={transport}>
        {children}
      </RelkitClientProvider>
    </>
  );
}
